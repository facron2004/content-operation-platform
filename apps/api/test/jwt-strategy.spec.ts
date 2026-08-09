import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAuthStatus = vi.fn();

vi.mock('../src/user-access/application/user-application.service', () => ({
  UserQueryService: class {
    findAuthStatus = findAuthStatus;
  }
}));

import { JwtStrategy } from '../src/auth/jwt.strategy';
import { UserQueryService } from '../src/user-access/application/user-application.service';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    findAuthStatus.mockReset();
    strategy = new JwtStrategy(new UserQueryService(null as never));
  });

  it('rejects inactive users', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: false,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'platform_operator' }]
    });
    await expect(
      strategy.validate({ sub: 'u1', username: 'bob', roles: ['platform_operator'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses DB roles instead of stale JWT roles', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]
    });
    const user = await strategy.validate({
      sub: 'u1',
      username: 'bob',
      roles: ['platform_operator', 'admin'],
      tv: 0
    });
    expect(user.roles).toEqual(['area_operator']);
    expect(user.bindings).toEqual([{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]);
    // tokenVersion must reach req.user so /auth/refresh can re-check the epoch.
    expect(user.tokenVersion).toBe(0);
  });

  it('clears cached auth status for all users in a changed tenant', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]
    });
    await strategy.validate({
      sub: 'u1',
      username: 'bob',
      roles: [],
      tenantId: 'tenant_default',
      tv: 0
    });

    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'merchant_operator', scopeType: 'merchant', scopeId: 'M1' }]
    });
    await strategy.validate({
      sub: 'u1',
      username: 'bob',
      roles: [],
      tenantId: 'tenant_default',
      tv: 0
    });
    expect(findAuthStatus).toHaveBeenCalledTimes(1);

    strategy.invalidateTenant('tenant_default');

    const refreshed = await strategy.validate({
      sub: 'u1',
      username: 'bob',
      roles: [],
      tenantId: 'tenant_default',
      tv: 0
    });
    expect(refreshed.roles).toEqual(['merchant_operator']);
    expect(findAuthStatus).toHaveBeenCalledTimes(2);
  });

  it('rejects JWT with mismatched tokenVersion after password/role revoke', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 3,
      tenantId: 'tenant_default',
      roles: [{ role: 'platform_operator' }]
    });
    await expect(
      strategy.validate({ sub: 'u1', username: 'bob', roles: ['platform_operator'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects env-admin JWT when the bootstrap AppUser is missing', async () => {
    findAuthStatus.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'admin', username: 'admin', roles: ['admin'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when env-admin AppUser lookup errors', async () => {
    findAuthStatus.mockResolvedValue(null);
    findAuthStatus.mockRejectedValueOnce(new Error('database unavailable'));
    const warn = vi.spyOn(
      (strategy as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn'
    );
    await expect(
      strategy.validate({ sub: 'admin', username: 'admin', roles: ['admin'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('database unavailable'));
  });

  it('logs IAM access lookup failures while preserving legacy role compatibility', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'platform_operator' }]
    });
    const getUserAccess = vi.fn().mockRejectedValue(new Error('IAM projection unavailable'));
    const strategyWithIam = new JwtStrategy(new UserQueryService(null as never), {
      getUserAccess
    } as never);
    const warn = vi.spyOn(
      (strategyWithIam as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn'
    );

    const user = await strategyWithIam.validate({
      sub: 'u1',
      username: 'bob',
      roles: ['platform_operator'],
      tv: 0
    });

    expect(user.roles).toEqual(['platform_operator']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('IAM projection unavailable'));
  });

  it('prefers seeded AppUser for env-admin sub=admin', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'admin',
      username: 'admin',
      isActive: true,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'admin' }]
    });
    const user = await strategy.validate({
      sub: 'admin',
      username: 'admin',
      roles: ['admin'],
      tv: 0
    });
    expect(user.roles).toEqual(['admin']);
    expect(findAuthStatus).toHaveBeenCalledWith('admin');
  });

  it('rejects deactivated AppUser for env-admin sub=admin', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'admin',
      username: 'admin',
      isActive: false,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'admin' }]
    });
    await expect(
      strategy.validate({ sub: 'admin', username: 'admin', roles: ['admin'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing users', async () => {
    findAuthStatus.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'gone', username: 'gone', roles: [], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects JWT when tokenVersion mismatches (password reset)', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 2,
      tenantId: 'tenant_default',
      roles: [{ role: 'platform_operator' }]
    });
    await expect(
      strategy.validate({ sub: 'u1', username: 'bob', roles: ['platform_operator'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects pre-tokenVersion JWT missing tv claim', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 0,
      tenantId: 'tenant_default',
      roles: [{ role: 'platform_operator' }]
    });
    await expect(
      strategy.validate({ sub: 'u1', username: 'bob', roles: ['platform_operator'] })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an active AppUser without a tenant boundary', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 0,
      roles: [{ role: 'platform_operator' }]
    });

    await expect(
      strategy.validate({ sub: 'u1', username: 'bob', roles: ['platform_operator'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
