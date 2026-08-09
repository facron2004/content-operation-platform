import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock bcrypt before importing the user application services.
vi.mock('bcrypt', () => ({
  hash: vi.fn(async (p: string) => `bcrypt:${p}`),
  compare: vi.fn(async () => true)
}));

import { UserCommandService } from '../src/user-access/application/user-application.service';

const TENANT_ID = 'tenant-a';

function commandOptions(
  overrides: { allowAdminRole?: boolean; allowUnrestrictedRoles?: boolean } = {}
) {
  return { tenantId: TENANT_ID, ...overrides };
}

function makePrisma() {
  const users = new Map<string, Record<string, unknown>>();
  const roles = new Map<string, Array<Record<string, unknown>>>();

  function applyAppUserUpdate(sql: string, params: unknown[]): Record<string, unknown> | null {
    // Atomic last-admin deactivate / isActive=false: UPDATE ... EXISTS (other admin)
    if (sql.includes('EXISTS')) {
      // Params end with: ..., userId, excludeUserId
      // deactivate: [now, userId, excludeId]
      // update: [...fieldValues, now, userId, excludeId]
      const tenantScoped = sql.includes('"tenantId" = ?');
      const isParameterizedUpdate = sql.includes('"isActive" = ?');
      const excludeOffset = tenantScoped ? (isParameterizedUpdate ? 3 : 2) : 1;
      const excludeId = String(params[params.length - excludeOffset] ?? '');
      const userId = String(params[params.length - (tenantScoped ? 4 : 2)] ?? '');
      let peerAdmins = 0;
      for (const [uid, list] of roles.entries()) {
        if (uid === excludeId) continue;
        const peer = users.get(uid);
        if (!peer || Number(peer.isActive) !== 1) continue;
        if (list.some((r) => r.role === 'admin')) peerAdmins += 1;
      }
      if (peerAdmins <= 0) return null;
      const row = users.get(userId);
      if (!row || Number(row.isActive) !== 1) return null;
      row.isActive = 0;
      if (sql.includes('tokenVersion')) {
        row.tokenVersion = Number(row.tokenVersion ?? 0) + 1;
      }
      users.set(userId, row);
      return row;
    }
    // Non-admin deactivate / plain update — last param is userId
    const userId = String(params[params.length - (sql.includes('"tenantId" = ?') ? 2 : 1)] ?? '');
    const row = users.get(userId);
    if (!row) return null;
    // Heuristic: if SQL sets isActive=0 (deactivate path without EXISTS)
    if (sql.includes('"isActive" = 0') || sql.includes('"isActive" = ?')) {
      // For parameterized isActive, value is among params before now/id
      if (sql.includes('"isActive" = 0')) {
        row.isActive = 0;
      } else {
        // find isActive value: scan SET fields order is unknown; tests only flip false
        const maybe = params.find((p) => p === 0 || p === 1);
        if (maybe === 0 || maybe === 1) row.isActive = Number(maybe);
      }
    }
    if (sql.includes('"passwordHash"')) {
      // first SET param after password is the hash
      const hashIdx = params.findIndex(
        (p) => typeof p === 'string' && String(p).startsWith('bcrypt:')
      );
      if (hashIdx >= 0) row.passwordHash = params[hashIdx];
    }
    if (sql.includes('tokenVersion')) {
      row.tokenVersion = Number(row.tokenVersion ?? 0) + 1;
    }
    users.set(userId, row);
    return row;
  }

  const queryRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    // Residual #169: update/deactivate happy path is $executeRawUnsafe (no RETURNING).
    if (sql.includes('FROM "AppUser" WHERE "username"')) {
      const username = params[0];
      for (const row of users.values()) {
        if (row.username === username) return [row];
      }
      return [];
    }
    if (sql.includes('FROM "AppUser" WHERE "userId"')) {
      const id = String(params[0]);
      const tenantId = String(params[1] ?? '');
      const row = users.get(id);
      return row && row.tenantId === tenantId ? [row] : [];
    }
    // Last-admin guard: COUNT other active users with admin binding.
    if (sql.includes('COUNT(*)') && sql.includes('"role" = \'admin\'')) {
      const excludeId = String(params[0] ?? '');
      let cnt = 0;
      for (const [uid, list] of roles.entries()) {
        if (uid === excludeId) continue;
        const user = users.get(uid);
        if (!user || Number(user.isActive) !== 1) continue;
        if (list.some((r) => r.role === 'admin')) cnt += 1;
      }
      return [{ cnt }];
    }
    if (sql.includes('FROM "UserRoleBinding"')) {
      const id = String(params[0]);
      return roles.get(id) ?? [];
    }
    // Scope existence: Merchant / ContentPackage lookups (tests seed none by default).
    if (sql.includes('FROM "Merchant"') || sql.includes('FROM "ContentPackage"')) {
      return [];
    }
    if (sql.includes('COUNT(*)')) return [{ count: users.size, cnt: users.size }];
    return [];
  });

  const executeRawUnsafe = vi.fn(async (sql: string, ...params: unknown[]) => {
    if (sql.startsWith('INSERT INTO "AppUser"')) {
      const [userId, username, passwordHash, displayName, email, phone, tenantId] =
        params as string[];
      users.set(userId, {
        userId,
        username,
        passwordHash,
        displayName,
        email,
        phone,
        tenantId,
        isActive: 1,
        tokenVersion: 0,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return 1;
    }
    if (sql.startsWith('INSERT INTO "UserRoleBinding"')) {
      // Multi-row insert: params are flat tuples of 6 (id, userId, role, scopeType, scopeId, createdAt).
      for (let i = 0; i + 5 < params.length; i += 6) {
        const [id, userId, role, scopeType, scopeId] = params.slice(i, i + 5) as string[];
        const list = roles.get(userId) ?? [];
        list.push({
          id,
          userId,
          role,
          scopeType,
          scopeId,
          createdAt: new Date().toISOString()
        });
        roles.set(userId, list);
      }
      return 1;
    }
    if (sql.startsWith('DELETE FROM "UserRoleBinding"')) {
      roles.set(String(params[0]), []);
      return 1;
    }
    if (sql.startsWith('UPDATE "AppUser"')) {
      // Legacy execute path (updateRoles tokenVersion bump etc.)
      return applyAppUserUpdate(sql, params) ? 1 : 0;
    }
    return 1;
  });

  return {
    prisma: {
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe })
    },
    users,
    roles
  };
}

describe('UserCommandService role binding validation', () => {
  let service: UserCommandService;

  beforeEach(() => {
    const { prisma } = makePrisma();
    service = new UserCommandService(prisma as never);
  });

  it('rejects inventing arbitrary roles on create', async () => {
    await expect(
      service.create(
        {
          username: 'evil',
          password: 'secret12',
          roles: [{ role: 'superadmin' as never }]
        },
        commandOptions()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects user commands without a usable tenant context', async () => {
    await expect(
      service.create({ username: 'missing-tenant', password: 'secret12' }, undefined as never)
    ).rejects.toThrow('会话缺少租户信息');
    await expect(service.update('u1', {}, '  ')).rejects.toThrow('会话缺少租户信息');
    await expect(service.deactivate('u1', '  ')).rejects.toThrow('会话缺少租户信息');
    await expect(service.updateRoles('u1', [], undefined as never)).rejects.toThrow(
      '会话缺少租户信息'
    );
  });

  it('does not mutate a user through a different tenant', async () => {
    const created = await service.create(
      { username: 'tenant-owned', password: 'secret12' },
      commandOptions()
    );

    await expect(
      service.update(created.userId, { displayName: 'cross-tenant' }, 'tenant-b')
    ).rejects.toThrow(`用户 ${created.userId} 不存在`);
  });

  it('rejects platform_operator granting admin role', async () => {
    await expect(
      service.create(
        {
          username: 'almost-admin',
          password: 'secret12',
          roles: [{ role: 'admin' }]
        },
        commandOptions({ allowAdminRole: false, allowUnrestrictedRoles: false })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects platform_operator granting peer unrestricted roles', async () => {
    await expect(
      service.create(
        {
          username: 'peer-op',
          password: 'secret12',
          roles: [{ role: 'platform_operator' }]
        },
        commandOptions({ allowAdminRole: false, allowUnrestrictedRoles: false })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        {
          username: 'peer-auditor',
          password: 'secret12',
          roles: [{ role: 'auditor' }]
        },
        commandOptions({ allowAdminRole: false, allowUnrestrictedRoles: false })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows admin to grant admin role', async () => {
    const { prisma, roles } = makePrisma();
    service = new UserCommandService(prisma as never);
    const user = await service.create(
      {
        username: 'new-admin',
        password: 'secret12',
        roles: [{ role: 'admin' }]
      },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    // Residual #170: slim shell — assert write side effects via store.
    expect(user.success).toBe(true);
    expect(user.username).toBe('new-admin');
    expect(user.userId).toBeTruthy();
    expect((roles.get(user.userId) ?? []).map((r) => r.role)).toContain('admin');
  });

  it('rejects scoped role without matching scopeId', async () => {
    await expect(
      service.create(
        {
          username: 'no-scope',
          password: 'secret12',
          roles: [{ role: 'area_operator' }]
        },
        commandOptions()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        {
          username: 'wrong-scope',
          password: 'secret12',
          roles: [{ role: 'merchant_operator', scopeType: 'area', scopeId: 'a1' }]
        },
        commandOptions()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid scopeType', async () => {
    await expect(
      service.create(
        {
          username: 'scoped',
          password: 'secret12',
          roles: [{ role: 'area_operator', scopeType: 'galaxy' as never, scopeId: 'x' }]
        },
        commandOptions()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid roles on updateRoles', async () => {
    const created = await service.create(
      { username: 'op', password: 'secret12', roles: [{ role: 'platform_operator' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    await expect(
      service.updateRoles(
        created.userId,
        { roles: [{ role: 'root' as never }] },
        commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stripping the last active admin role binding', async () => {
    const solo = await service.create(
      { username: 'solo-admin', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    await expect(
      service.updateRoles(
        solo.userId,
        { roles: [{ role: 'platform_operator' }] },
        commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
      )
    ).rejects.toThrow(/最后一个有效 admin/);
  });

  it('allows demoting admin when another active admin remains', async () => {
    const { prisma, roles, users } = makePrisma();
    service = new UserCommandService(prisma as never);
    const a = await service.create(
      { username: 'admin-a', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    await service.create(
      { username: 'admin-b', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    // Residual #169: slim shell — assert side effects via store, not body roles.
    const updated = await service.updateRoles(
      a.userId,
      { roles: [{ role: 'platform_operator' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    expect(updated.success).toBe(true);
    expect(updated.userId).toBe(a.userId);
    expect((roles.get(a.userId) ?? []).map((r) => r.role)).toEqual(['platform_operator']);
    expect(Number(users.get(a.userId)?.tokenVersion ?? 0)).toBe(1);
  });

  it('rejects deactivating the last active admin account', async () => {
    const solo = await service.create(
      { username: 'solo-admin-2', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    await expect(service.deactivate(solo.userId, TENANT_ID)).rejects.toThrow(/最后一个有效 admin/);
    await expect(service.update(solo.userId, { isActive: false }, TENANT_ID)).rejects.toThrow(
      /最后一个有效 admin/
    );
  });

  it('rejects scoped role with non-existent scopeId', async () => {
    await expect(
      service.create(
        {
          username: 'ghost-area',
          password: 'secret12',
          roles: [{ role: 'area_operator', scopeType: 'area', scopeId: 'no-such-area' }]
        },
        commandOptions()
      )
    ).rejects.toThrow(/区域 scopeId 不存在/);
    await expect(
      service.create(
        {
          username: 'ghost-merchant',
          password: 'secret12',
          roles: [{ role: 'merchant_operator', scopeType: 'merchant', scopeId: 'no-such-m' }]
        },
        commandOptions()
      )
    ).rejects.toThrow(/商家 scopeId 不存在/);
  });

  it('bumps tokenVersion on password reset', async () => {
    const { prisma, users } = makePrisma();
    service = new UserCommandService(prisma as never);
    const created = await service.create(
      { username: 'pw-user', password: 'secret12', roles: [{ role: 'platform_operator' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    expect(Number(users.get(created.userId)?.tokenVersion ?? 0)).toBe(0);
    // Residual #169: slim shell — assert tokenVersion via store.
    const updated = await service.update(created.userId, { password: 'newsecret9' }, TENANT_ID);
    expect(updated.success).toBe(true);
    expect(updated.userId).toBe(created.userId);
    expect(Number(users.get(created.userId)?.tokenVersion ?? 0)).toBe(1);
    const again = await service.update(created.userId, { password: 'another9x' }, TENANT_ID);
    expect(again.success).toBe(true);
    expect(Number(users.get(created.userId)?.tokenVersion ?? 0)).toBe(2);
  });

  it('bumps tokenVersion on role demotion so live JWTs are revoked', async () => {
    const { prisma, roles, users } = makePrisma();
    service = new UserCommandService(prisma as never);
    const a = await service.create(
      { username: 'admin-tv', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    await service.create(
      { username: 'admin-tv-b', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    expect(Number(users.get(a.userId)?.tokenVersion ?? 0)).toBe(0);
    const demoted = await service.updateRoles(
      a.userId,
      { roles: [{ role: 'platform_operator' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    expect(demoted.success).toBe(true);
    expect((roles.get(a.userId) ?? []).map((r) => r.role)).toEqual(['platform_operator']);
    expect(Number(users.get(a.userId)?.tokenVersion ?? 0)).toBe(1);
  });

  it('bumps tokenVersion on deactivate so live JWTs are revoked', async () => {
    const { prisma, users } = makePrisma();
    service = new UserCommandService(prisma as never);
    const a = await service.create(
      { username: 'admin-off', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    await service.create(
      { username: 'admin-off-b', password: 'secret12', roles: [{ role: 'admin' }] },
      commandOptions({ allowAdminRole: true, allowUnrestrictedRoles: true })
    );
    const off = await service.deactivate(a.userId, TENANT_ID);
    expect(off.success).toBe(true);
    expect(off.isActive).toBe(false);
    expect(Number(users.get(a.userId)?.isActive)).toBe(0);
    expect(Number(users.get(a.userId)?.tokenVersion ?? 0)).toBe(1);
  });
});
