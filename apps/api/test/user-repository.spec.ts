import { describe, expect, it, vi } from 'vitest';
import {
  findAuthByColumn,
  findTenantId,
  findRolesByUserId,
  findUserById,
  findUserByUsername,
  getUserActiveMeta,
  hasAnyUsers,
  hasAdminRole,
  insertUser,
  updateUser,
  hasUnrestrictedPeerRole
} from '../src/user-access/repositories/user.repository';
import { UserCommandService } from '../src/user-access/application/user-application.service';

describe('user repository/runtime projections', () => {
  it('uses an existence-only query for hasAnyUsers', async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([{ ok: 1 }]);

    await expect(hasAnyUsers({ $queryRawUnsafe: queryRawUnsafe } as never)).resolves.toBe(true);

    expect(String(queryRawUnsafe.mock.calls[0][0])).toContain(
      'SELECT 1 AS ok FROM "AppUser" LIMIT 1'
    );
  });

  it('does not expose the removed findByUsername command method', () => {
    expect('findByUsername' in UserCommandService.prototype).toBe(false);
  });

  it('keeps auth, role, peer, and list projections narrow at runtime', async () => {
    const queryRawUnsafe = vi.fn(async (sql: string) => {
      if (sql.includes('passwordHash') || sql.includes('tokenVersion')) {
        return [
          {
            userId: 'u1',
            username: 'alice',
            isActive: 1,
            tokenVersion: 2,
            passwordHash: 'hash'
          }
        ];
      }
      if (sql.includes('FROM "UserRoleBinding"') && sql.includes('role"')) {
        return [{ role: 'platform_operator', scopeType: null, scopeId: null }];
      }
      if (sql.includes('FROM "AppUser"') && sql.includes('LIMIT 1')) {
        return [{ role: 'platform_operator' }];
      }
      return [
        {
          userId: 'u1',
          username: 'alice',
          displayName: 'Alice',
          email: null,
          phone: null,
          isActive: 1,
          lastLoginAt: null,
          createdAt: '2026-01-01 00:00:00',
          updatedAt: '2026-01-01 00:00:00'
        }
      ];
    });
    const tx = { $queryRawUnsafe: queryRawUnsafe } as never;

    await expect(findUserByUsername(tx, 'alice')).resolves.toMatchObject({
      userId: 'u1',
      tokenVersion: 2
    });
    await expect(findAuthByColumn(tx, 'username', 'alice')).resolves.toMatchObject({
      userId: 'u1',
      tokenVersion: 2
    });
    await expect(findRolesByUserId(tx, 'u1')).resolves.toEqual([
      { role: 'platform_operator', scopeType: null, scopeId: null }
    ]);
    await expect(hasUnrestrictedPeerRole(tx, 'u1', 'tenant_default')).resolves.toBe(true);
    await expect(findUserById(tx, 'u1', 'tenant_default')).resolves.toMatchObject({
      userId: 'u1',
      displayName: 'Alice'
    });

    const sql = queryRawUnsafe.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('"userId", "username", "isActive", "tokenVersion", "passwordHash"');
    expect(sql).toContain('"role", "scopeType", "scopeId" FROM "UserRoleBinding"');
    expect(sql).toContain('"userId", "username", "displayName", "email", "phone", "isActive"');
    expect(sql).not.toMatch(/SELECT \*|"passwordHash"[^\n]*"displayName"/);
  });

  it('always adds the tenant predicate to legacy user projections', async () => {
    const queryRawUnsafe = vi.fn(async (sql: string) => {
      if (sql.includes('FROM "UserRoleBinding"')) return [{ role: 'admin' }];
      return [
        {
          userId: 'u1',
          username: 'alice',
          displayName: 'Alice',
          email: null,
          phone: null,
          isActive: 1,
          lastLoginAt: null,
          createdAt: '2026-01-01 00:00:00',
          updatedAt: '2026-01-01 00:00:00'
        }
      ];
    });
    const tx = { $queryRawUnsafe: queryRawUnsafe } as never;

    await findUserById(tx, 'u1', 'tenant-a');
    await hasUnrestrictedPeerRole(tx, 'u1', 'tenant-a');

    expect(queryRawUnsafe.mock.calls[0]).toEqual([
      expect.stringContaining('AND "tenantId" = ?'),
      'u1',
      'tenant-a'
    ]);
    expect(queryRawUnsafe.mock.calls[1]).toEqual([
      expect.stringContaining('AND u."tenantId" = ?'),
      'u1',
      'tenant-a'
    ]);
  });

  it('fails closed when tenant identity cannot be read', async () => {
    const queryError = new Error('database is unavailable');
    await expect(
      findTenantId({ $queryRawUnsafe: vi.fn().mockRejectedValue(queryError) } as never, 'u1')
    ).rejects.toBe(queryError);

    await expect(
      findTenantId(
        { $queryRawUnsafe: vi.fn().mockResolvedValue([{ tenantId: null }]) } as never,
        'u1'
      )
    ).rejects.toThrow('no usable tenantId');
  });

  it('keeps user command projections and writes tenant-scoped', async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([{ isActive: 1 }, { role: 'admin' }]);
    const executeRawUnsafe = vi.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe } as never;

    await expect(getUserActiveMeta(tx, 'u1', 'tenant-a')).resolves.toEqual({ isActive: true });
    await expect(hasAdminRole(tx, 'u1', 'tenant-a')).resolves.toBe(true);
    await insertUser(tx, {
      userId: 'u1',
      username: 'alice',
      passwordHash: 'hash',
      displayName: 'Alice',
      email: null,
      phone: null,
      tenantId: 'tenant-a'
    });
    await updateUser(tx, 'u1', ['"displayName" = ?'], ['Alice'], 'tenant-a');

    expect(queryRawUnsafe.mock.calls[0]).toEqual([
      expect.stringContaining('WHERE "userId" = ? AND "tenantId" = ?'),
      'u1',
      'tenant-a'
    ]);
    expect(queryRawUnsafe.mock.calls[1]).toEqual([
      expect.stringContaining('u."tenantId" = ?'),
      'u1',
      'tenant-a'
    ]);
    expect(executeRawUnsafe.mock.calls[0]).toEqual([
      expect.stringContaining('"tenantId", "createdAt", "updatedAt"'),
      'u1',
      'alice',
      'hash',
      'Alice',
      null,
      null,
      'tenant-a',
      expect.any(String),
      expect.any(String)
    ]);
    expect(executeRawUnsafe.mock.calls[1]).toEqual([
      expect.stringContaining('WHERE "userId" = ? AND "tenantId" = ?'),
      'Alice',
      expect.any(String),
      'u1',
      'tenant-a'
    ]);
  });
});
