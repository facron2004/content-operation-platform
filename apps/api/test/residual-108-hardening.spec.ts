import { describe, expect, it } from 'vitest';

describe('residual #108 distribution-task controller packageId-only scope', () => {
  it('service exposes getTaskAccessMeta / getTaskPackageId', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Residual #151: packageId+status probe; getTaskPackageId aliases it.
    expect(src).toMatch(/async getTaskAccessMeta\(id: string\)/);
    expect(src).toMatch(/t\."packageId", t\."status"/);
    expect(src).toMatch(/LEFT JOIN "ContentPackage"/);
    const pkgStart = src.indexOf('async getTaskPackageId(id: string)');
    expect(pkgStart).toBeGreaterThan(0);
    const pkgFn = src.slice(pkgStart, pkgStart + 300);
    expect(pkgFn).toMatch(/getTaskAccessMeta\(id\)/);
  });

  it('mutate + performance controllers use package scope probe (not full getById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.controller.ts'),
      'utf8'
    );

    // Full getById remains only for GET :id detail; Residual #167 folds packageGeo.
    const detailStart = src.indexOf('async getById(@Param');
    expect(detailStart).toBeGreaterThan(0);
    const detailNext = src.indexOf('\n  @Roles(', detailStart + 10);
    const detail = src.slice(detailStart, detailNext > 0 ? detailNext : detailStart + 700);
    expect(detail).toMatch(/this\.svc\.getById\(safeId\)/);
    expect(detail).toMatch(/assertTaskAccess\(detail\.packageId,\s*req,\s*detail\.packageGeo\)/);

    // Residual #151: status mutates use getTaskAccessMeta; others packageId-only.
    for (const action of ['complete', 'fail', 'cancel', 'reassign'] as const) {
      const needle = `async ${action}(@Param`;
      const fnStart = src.indexOf(needle);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/this\.svc\.getTaskAccessMeta\(safeId\)/);
      expect(fn).not.toMatch(/this\.svc\.getById\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(access\.packageId/);
    }

    // Residual #160: getPerformance uses access meta (+ geo) for scope.
    {
      const fnStart = src.indexOf('async getPerformance(@Param');
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/this\.svc\.getTaskAccessMeta\(safeId\)/);
      expect(fn).not.toMatch(/this\.svc\.getById\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(access\.packageId/);
      expect(fn).toMatch(/access\.packageGeo/);
    }

    // Residual #159: delete meta doubles as packageId scope probe.
    {
      const fnStart = src.indexOf('async delete(@Param');
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
      const fn = src.slice(fnStart, next);
      expect(fn).toMatch(/this\.svc\.getTaskDeleteMeta\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(meta\.packageId/);
      expect(fn).toMatch(/this\.svc\.delete\(safeId, meta\)/);
      expect(fn).not.toMatch(/this\.svc\.getById\(safeId\)/);
      expect(fn).not.toMatch(/getTaskPackageId/);
    }

    // update: freeze meta doubles as packageId scope probe.
    {
      const fnStart = src.indexOf('async update(@Param');
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
      const fn = src.slice(fnStart, next);
      expect(fn).toMatch(/this\.svc\.getTaskUpdateMeta\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(meta\.packageId/);
      expect(fn).toMatch(/this\.svc\.update\(safeId, body, meta\)/);
      expect(fn).not.toMatch(/this\.svc\.getById\(safeId\)/);
      expect(fn).not.toMatch(/getTaskPackageId/);
    }

    // schedule/publish: full row doubles as packageId+geo scope probe.
    for (const action of ['schedule', 'publish'] as const) {
      const fnStart = src.indexOf(`async ${action}(@Param`);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
      const fn = src.slice(fnStart, next);
      expect(fn).toMatch(/this\.svc\.getTaskRow\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(task\.packageId,\s*req,\s*task\.packageGeo\)/);
      expect(fn).not.toMatch(/this\.svc\.getById\(safeId\)/);
      expect(fn).not.toMatch(/getTaskPackageId/);
    }
  });
});
