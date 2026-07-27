import { describe, expect, it } from 'vitest';

describe('residual #151 DT packageId+status single probe', () => {
  it('getTaskAccessMeta SELECTs packageId+status; getTaskPackageId aliases it', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const metaStart = src.indexOf('async getTaskAccessMeta(');
    expect(metaStart).toBeGreaterThan(0);
    const metaFn = src.slice(metaStart, metaStart + 1200);
    expect(metaFn).toMatch(/t\."packageId"/);
    expect(metaFn).toMatch(/t\."status"/);
    expect(metaFn).toMatch(/LEFT JOIN "ContentPackage"/);
    expect(metaFn).toMatch(/packageGeo/);

    const pkgStart = src.indexOf('async getTaskPackageId(');
    expect(pkgStart).toBeGreaterThan(0);
    const pkgFn = src.slice(pkgStart, pkgStart + 250);
    expect(pkgFn).toMatch(/getTaskAccessMeta\(id\)/);
  });

  it('status mutators accept preloadedStatus; controller passes access.status', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const service = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    const controller = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.controller.ts'),
      'utf8'
    );

    for (const fnName of [
      'async fail(',
      'async cancel(',
      'async complete(',
      'async reassign('
    ] as const) {
      const fnStart = service.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        service.indexOf('\n  async ', fnStart + 10),
        service.indexOf('\n  /**', fnStart + 10),
        service.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
      const fn = service.slice(fnStart, next);
      // Residual #151: optional preloaded status skips the second SELECT on happy path.
      expect(fn).toMatch(/preloadedStatus/);
      expect(fn).toMatch(/preloadedStatus \?\? \(await this\.getTaskStatus\(id\)\)/);
    }

    for (const action of ['complete', 'fail', 'cancel', 'reassign'] as const) {
      const fnStart = controller.search(new RegExp(`async ${action}\\(\\s*@Param`));
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = controller.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = controller.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = controller.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 800;
      const fn = controller.slice(fnStart, next);
      expect(fn).toMatch(/getTaskAccessMeta\(safeId\)/);
      expect(fn).toMatch(/access\.status/);
    }
  });
});
