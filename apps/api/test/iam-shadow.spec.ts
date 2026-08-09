import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IamShadowService } from '../src/user-access/iam/iam-shadow.service';

function createService(
  access: { userId?: string; tenantId?: string; roles?: string[] } | null,
  legacyBindings: unknown[] = (access?.roles ?? []).map((role) => ({ role })),
  persistedLegacyBindings: unknown[] = legacyBindings
) {
  return new IamShadowService({
    getUserAccess: async () => access,
    getLegacyBindings: async () => legacyBindings,
    getPersistedLegacyBindings: async () => persistedLegacyBindings
  } as never);
}

describe('IamShadowService', () => {
  beforeEach(() => {
    delete process.env.IAM_SHADOW_MODE;
  });

  it('records matching and differing projections as structured counters', async () => {
    const access = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      roles: ['editor'],
      permissions: []
    };
    const service = createService(access);

    await service.inspect({
      path: '/api/packages',
      user: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['editor'],
        bindings: [{ role: 'editor' }]
      }
    });

    const differingService = createService(access, undefined, [{ role: 'viewer' }]);
    await differingService.inspect({
      path: '/api/users',
      user: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['editor'],
        bindings: [{ role: 'editor' }]
      }
    });

    expect(service.getStats()).toMatchObject({
      comparisons: 1,
      matches: 1,
      mismatches: 0,
      skipped: 0,
      byPath: {
        '/api/packages': { comparisons: 1, matches: 1, mismatches: 0 }
      }
    });
    expect(differingService.getStats()).toMatchObject({
      comparisons: 1,
      matches: 0,
      mismatches: 1,
      skipped: 0,
      byPath: {
        '/api/users': { comparisons: 1, matches: 0, mismatches: 1 }
      }
    });
    expect(differingService.getStats().lastMismatchAt).toEqual(expect.any(String));
  });

  it('counts missing IAM projections as skipped instead of a false mismatch', async () => {
    const service = createService(null);

    await service.inspect({
      path: '/api/packages',
      user: { userId: 'user-1', tenantId: 'tenant-1' }
    });

    expect(service.getStats()).toMatchObject({
      comparisons: 0,
      matches: 0,
      mismatches: 0,
      skipped: 1,
      byPath: {
        '/api/packages': { comparisons: 0, matches: 0, mismatches: 0, skipped: 1 }
      }
    });
  });

  it('records IAM access read failures as structured skipped comparisons', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const service = new IamShadowService({
        getUserAccess: async () => {
          throw new Error('IAM access unavailable');
        },
        getLegacyBindings: async () => [],
        getPersistedLegacyBindings: async () => []
      } as never);

      await expect(
        service.inspect({
          path: '/api/packages',
          user: { userId: 'user-1', tenantId: 'tenant-1' }
        })
      ).resolves.toBeUndefined();

      expect(service.getStats()).toMatchObject({
        comparisons: 0,
        matches: 0,
        mismatches: 0,
        skipped: 1,
        byPath: {
          '/api/packages': { comparisons: 0, matches: 0, mismatches: 0, skipped: 1 }
        }
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"iam_shadow_skipped"'));
      expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
        event: 'iam_shadow_skipped',
        path: '/api/packages',
        userId: 'user-1',
        tenantId: 'tenant-1',
        reason: 'IAM access unavailable'
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('fails open when the legacy projection lookup is unavailable', async () => {
    const service = new IamShadowService({
      getUserAccess: async () => ({
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: ['editor'],
        permissions: []
      }),
      getLegacyBindings: async () => {
        throw new Error('legacy projection unavailable');
      },
      getPersistedLegacyBindings: async () => []
    } as never);

    await expect(
      service.inspect({
        path: '/api/packages',
        user: { userId: 'user-1', tenantId: 'tenant-1', roles: ['editor'] }
      })
    ).resolves.toBeUndefined();

    expect(service.getStats()).toMatchObject({
      comparisons: 0,
      matches: 0,
      mismatches: 0,
      skipped: 1,
      byPath: {
        '/api/packages': { comparisons: 0, matches: 0, mismatches: 0, skipped: 1 }
      }
    });
  });

  it('can reset counters before a new acceptance dataset', async () => {
    const service = createService({ userId: 'user-1', tenantId: 'tenant-1', roles: [] });
    await service.inspect({ path: '/api/packages', user: { userId: 'user-1' } });
    service.resetStats();

    expect(service.getStats()).toMatchObject({
      comparisons: 0,
      matches: 0,
      mismatches: 0,
      skipped: 0,
      byPath: {}
    });
  });
});
