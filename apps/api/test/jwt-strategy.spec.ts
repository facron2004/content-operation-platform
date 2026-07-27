import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAuthStatus = vi.fn();
const hasAnyUsers = vi.fn();

vi.mock('../src/user-access/user.service', () => ({
  UserService: class {
    findAuthStatus = findAuthStatus;
    hasAnyUsers = hasAnyUsers;
  }
}));

import { JwtStrategy } from '../src/auth/jwt.strategy';
import { UserService } from '../src/user-access/user.service';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    findAuthStatus.mockReset();
    hasAnyUsers.mockReset();
    hasAnyUsers.mockResolvedValue(false);
    strategy = new JwtStrategy(new UserService(null as never));
  });

  it('rejects inactive users', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: false,
      tokenVersion: 0,
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

  it('rejects JWT with mismatched tokenVersion after password/role revoke', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'u1',
      username: 'bob',
      isActive: true,
      tokenVersion: 3,
      roles: [{ role: 'platform_operator' }]
    });
    await expect(
      strategy.validate({ sub: 'u1', username: 'bob', roles: ['platform_operator'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falls back to token claims for env-admin when user table is empty', async () => {
    findAuthStatus.mockResolvedValue(null);
    hasAnyUsers.mockResolvedValue(false);
    const user = await strategy.validate({
      sub: 'admin',
      username: 'admin',
      roles: ['admin'],
      tv: 0
    });
    expect(user.userId).toBe('admin');
    expect(user.roles).toContain('admin');
    expect(user.bindings).toEqual([]);
    expect(findAuthStatus).toHaveBeenCalledWith('admin');
  });

  it('rejects env-admin cold-start JWT once any AppUser exists', async () => {
    findAuthStatus.mockResolvedValue(null);
    hasAnyUsers.mockResolvedValue(true);
    await expect(
      strategy.validate({ sub: 'admin', username: 'admin', roles: ['admin'], tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('prefers seeded AppUser for env-admin sub=admin', async () => {
    findAuthStatus.mockResolvedValue({
      userId: 'admin',
      username: 'admin',
      isActive: true,
      tokenVersion: 0,
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
      roles: [{ role: 'platform_operator' }]
    });
    await expect(
      strategy.validate({ sub: 'u1', username: 'bob', roles: ['platform_operator'] })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
