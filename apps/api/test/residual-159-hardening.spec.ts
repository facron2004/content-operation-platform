import { describe, expect, it } from 'vitest';

describe('residual #159 DT delete packageId + delete-meta fold', () => {
  it('getTaskDeleteMeta is public and SELECTs packageId+status+publishedAt', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async getTaskDeleteMeta(');
    expect(fnStart).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, fnStart - 20), fnStart)).not.toMatch(/private\s+$/);
    const fn = src.slice(fnStart, fnStart + 1200);
    expect(fn).toMatch(/t\."packageId"/);
    expect(fn).toMatch(/t\."status"/);
    expect(fn).toMatch(/t\."publishedAt"/);
    expect(fn).toMatch(/LEFT JOIN "ContentPackage"/);
    expect(fn).toMatch(/packageGeo/);
  });

  it('delete accepts preloadedMeta; controller passes delete meta', async () => {
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

    const delStart = service.indexOf('async delete(');
    expect(delStart).toBeGreaterThan(0);
    const candidates = [
      service.indexOf('\n  async ', delStart + 10),
      service.indexOf('\n  /**', delStart + 10)
    ].filter((i) => i > 0);
    const del = service.slice(
      delStart,
      candidates.length ? Math.min(...candidates) : delStart + 1500
    );
    expect(del).toMatch(/preloadedMeta\?/);
    expect(del).toMatch(/preloadedMeta \?\? \(await this\.getTaskDeleteMeta\(id\)\)/);
    // Failure arm still re-probes delete meta.
    expect(del).toMatch(/const latest = await this\.getTaskDeleteMeta\(id\)/);
    expect(del).toMatch(/return \{ success: true \}/);

    const cStart = controller.search(/async delete\(\s*@Param/);
    expect(cStart).toBeGreaterThan(0);
    const nextRoles = controller.indexOf('\n  @Roles(', cStart + 10);
    const nextGet = controller.indexOf('\n  @Get(', cStart + 10);
    const nextPrivate = controller.indexOf('\n  private ', cStart + 10);
    const cCandidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
    const cFn = controller.slice(
      cStart,
      cCandidates.length ? Math.min(...cCandidates) : cStart + 500
    );
    expect(cFn).toMatch(/getTaskDeleteMeta\(safeId\)/);
    expect(cFn).toMatch(/assertTaskAccess\(meta\.packageId/);
    expect(cFn).toMatch(/this\.svc\.delete\(safeId, meta\)/);
    expect(cFn).not.toMatch(/getTaskPackageId/);
    expect(cFn).not.toMatch(/getById/);
  });
});
