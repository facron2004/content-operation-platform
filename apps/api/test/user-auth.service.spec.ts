import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUserByUsername: vi.fn(),
  findRolesByUserId: vi.fn(),
  findTenantId: vi.fn(),
  updatePasswordHash: vi.fn(),
  updateLastLogin: vi.fn(),
  hash: vi.fn()
}));

vi.mock('../src/user-access/repositories/user.repository', () => ({
  findUserByUsername: mocks.findUserByUsername,
  findRolesByUserId: mocks.findRolesByUserId,
  findTenantId: mocks.findTenantId,
  updatePasswordHash: mocks.updatePasswordHash,
  updateLastLogin: mocks.updateLastLogin
}));

vi.mock('../src/user-access/application/auth-utils', () => ({
  burnPasswordVerifyCost: vi.fn().mockResolvedValue(undefined),
  isLegacyHash: vi.fn().mockReturnValue(true),
  verifyLegacyPassword: vi.fn().mockReturnValue(true),
  verifyPassword: vi.fn().mockResolvedValue(true)
}));

vi.mock('bcrypt', () => ({ hash: mocks.hash }));

import { UserAuthService } from '../src/user-access/application/user-auth.service';

describe('UserAuthService persistence boundaries', () => {
  beforeEach(() => {
    mocks.findUserByUsername.mockReset().mockResolvedValue({
      userId: 'u1',
      username: 'alice',
      isActive: 1,
      tokenVersion: 2,
      passwordHash: 'legacy-hash'
    });
    mocks.findRolesByUserId
      .mockReset()
      .mockResolvedValue([{ role: 'admin', scopeType: null, scopeId: null }]);
    mocks.findTenantId.mockReset().mockResolvedValue('tenant-a');
    mocks.updatePasswordHash.mockReset().mockResolvedValue(undefined);
    mocks.updateLastLogin.mockReset().mockResolvedValue(undefined);
    mocks.hash.mockReset().mockResolvedValue('bcrypt-hash');
  });

  it('keeps login usable but logs a failed legacy-hash upgrade', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mocks.updatePasswordHash.mockRejectedValue(new Error('database locked'));

    await expect(
      new UserAuthService({} as never).validateUser('alice', 'password')
    ).resolves.toMatchObject({
      userId: 'u1',
      tenantId: 'tenant-a'
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('旧密码哈希升级失败'));
    warn.mockRestore();
  });

  it('keeps login usable but logs a failed last-login write', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mocks.updateLastLogin.mockRejectedValue(new Error('database locked'));

    await expect(
      new UserAuthService({} as never).validateUser('alice', 'password')
    ).resolves.toMatchObject({
      userId: 'u1',
      tenantId: 'tenant-a'
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lastLoginAt 写入失败'));
    warn.mockRestore();
  });

  it('does not return an authenticated user when tenant resolution fails', async () => {
    const tenantError = new Error('tenant table unavailable');
    mocks.findTenantId.mockRejectedValue(tenantError);

    await expect(new UserAuthService({} as never).validateUser('alice', 'password')).rejects.toBe(
      tenantError
    );
  });
});
