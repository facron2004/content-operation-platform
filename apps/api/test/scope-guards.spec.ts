import { describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertPackageInScope, assertUnrestrictedAnalytics } from '../src/user-access/scope-guards';

function reqWith(user: unknown) {
  return { user } as never;
}

describe('assertUnrestrictedAnalytics', () => {
  it('allows admin / platform_operator / auditor', () => {
    expect(() => assertUnrestrictedAnalytics(reqWith({ roles: ['admin'] }))).not.toThrow();
    expect(() =>
      assertUnrestrictedAnalytics(reqWith({ roles: ['platform_operator'] }))
    ).not.toThrow();
    expect(() => assertUnrestrictedAnalytics(reqWith({ roles: ['auditor'] }))).not.toThrow();
  });

  it('denies scoped area_operator', () => {
    expect(() =>
      assertUnrestrictedAnalytics(
        reqWith({
          roles: ['area_operator'],
          bindings: [{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]
        })
      )
    ).toThrow(ForbiddenException);
  });

  it('denies unbound scoped role (emptyScope)', () => {
    expect(() =>
      assertUnrestrictedAnalytics(reqWith({ roles: ['merchant_operator'], bindings: [] }))
    ).toThrow(ForbiddenException);
  });
});

describe('assertPackageInScope', () => {
  it('allows unrestricted without DB lookup', async () => {
    const prisma = { $queryRawUnsafe: async () => [] } as never;
    await expect(
      assertPackageInScope(prisma, 'P1', reqWith({ roles: ['admin'] }))
    ).resolves.toBeUndefined();
  });

  it('rejects blank packageId before DB lookup', async () => {
    let called = false;
    const prisma = {
      $queryRawUnsafe: async () => {
        called = true;
        return [];
      }
    } as never;
    await expect(
      assertPackageInScope(prisma, '   ', reqWith({ roles: ['admin'] }))
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(called).toBe(false);
  });

  it('denies emptyScope', async () => {
    const prisma = { $queryRawUnsafe: async () => [] } as never;
    await expect(
      assertPackageInScope(prisma, 'P1', reqWith({ roles: ['area_operator'], bindings: [] }))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies out-of-scope package', async () => {
    const prisma = {
      $queryRawUnsafe: async () => [{ packageId: 'P1', areaId: 'A9', merchantId: 'M9' }]
    } as never;
    await expect(
      assertPackageInScope(
        prisma,
        'P1',
        reqWith({
          roles: ['area_operator'],
          bindings: [{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]
        })
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows in-scope package', async () => {
    const prisma = {
      $queryRawUnsafe: async () => [{ packageId: 'P1', areaId: 'A1', merchantId: 'M1' }]
    } as never;
    await expect(
      assertPackageInScope(
        prisma,
        'P1',
        reqWith({
          roles: ['area_operator'],
          bindings: [{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]
        })
      )
    ).resolves.toBeUndefined();
  });

  it('throws NotFound when package missing', async () => {
    const prisma = { $queryRawUnsafe: async () => [] } as never;
    await expect(
      assertPackageInScope(
        prisma,
        'missing',
        reqWith({
          roles: ['merchant_operator'],
          bindings: [{ role: 'merchant_operator', scopeType: 'merchant', scopeId: 'M1' }]
        })
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('assertPackagesInScope', () => {
  it('batch-checks multiple packages with one IN query', async () => {
    const { assertPackagesInScope } = await import('../src/user-access/scope-guards');
    let sql = '';
    const prisma = {
      $queryRawUnsafe: async (q: string) => {
        sql = q;
        return [
          { packageId: 'P1', areaId: 'A1', merchantId: 'M1' },
          { packageId: 'P2', areaId: 'A1', merchantId: 'M2' }
        ];
      }
    } as never;
    await expect(
      assertPackagesInScope(
        prisma,
        ['P1', 'P2'],
        reqWith({
          roles: ['area_operator'],
          bindings: [{ role: 'area_operator', scopeType: 'area', scopeId: 'A1' }]
        })
      )
    ).resolves.toBeUndefined();
    expect(sql).toMatch(/IN \(/);
  });
});
