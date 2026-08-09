import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../src/config/auth.config';

describe('AuthService AppUser boundary', () => {
  const sign = vi.fn();
  const validateUser = vi.fn();
  const findAuthStatus = vi.fn();
  const findAuthStatusByUsername = vi.fn();

  function createService() {
    return new AuthService(
      { sign } as never,
      { validateUser } as never,
      { findAuthStatus, findAuthStatusByUsername } as never
    );
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    sign.mockReset().mockReturnValue('token');
    validateUser.mockReset().mockResolvedValue(null);
    findAuthStatus.mockReset().mockResolvedValue(null);
    findAuthStatusByUsername.mockReset().mockResolvedValue(null);
  });

  it('rejects password login when AppUser validation fails', async () => {
    await expect(createService().login(ADMIN_USERNAME, ADMIN_PASSWORD)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(sign).not.toHaveBeenCalled();
  });

  it('signs a validated AppUser', async () => {
    validateUser.mockResolvedValue({
      userId: 'admin',
      username: ADMIN_USERNAME,
      roles: [{ role: 'admin' }],
      tokenVersion: 0,
      tenantId: 'tenant_default'
    });

    await expect(createService().login(ADMIN_USERNAME, ADMIN_PASSWORD)).resolves.toEqual({
      access_token: 'token',
      username: ADMIN_USERNAME
    });
    expect(sign).toHaveBeenCalledWith({
      sub: 'admin',
      username: ADMIN_USERNAME,
      roles: ['admin'],
      tenantId: 'tenant_default',
      tv: 0
    });
  });

  it('rejects a validated AppUser without a tenant boundary', async () => {
    validateUser.mockResolvedValue({
      userId: 'admin',
      username: ADMIN_USERNAME,
      roles: [{ role: 'admin' }],
      tokenVersion: 0
    });

    await expect(createService().login(ADMIN_USERNAME, ADMIN_PASSWORD)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects local-session when the bootstrap AppUser is missing', async () => {
    await expect(createService().localSession()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('logs local-session lookup failures before rejecting', async () => {
    const service = createService();
    const warn = vi.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn'
    );
    findAuthStatus.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.localSession()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('database unavailable'));
  });

  it('rejects refresh when the AppUser is missing', async () => {
    await expect(
      createService().refresh({ sub: 'admin', username: ADMIN_USERNAME, tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('logs refresh lookup failures before rejecting', async () => {
    const service = createService();
    const warn = vi.spyOn(
      (service as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn'
    );
    findAuthStatus.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.refresh({ sub: 'admin', username: ADMIN_USERNAME, tv: 0 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('database unavailable'));
  });
});
