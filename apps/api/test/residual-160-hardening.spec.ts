import { describe, expect, it } from 'vitest';

describe('residual #160 DT package geo fold into access probes', () => {
  it('access/update/delete meta LEFT JOIN ContentPackage for packageGeo', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    for (const name of [
      'async getTaskAccessMeta(',
      'async getTaskUpdateMeta(',
      'async getTaskDeleteMeta('
    ] as const) {
      const start = src.indexOf(name);
      expect(start).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', start + 10),
        src.indexOf('\n  /**', start + 10),
        src.indexOf('\n  private ', start + 10)
      ].filter((i) => i > 0);
      const fn = src.slice(start, candidates.length ? Math.min(...candidates) : start + 1200);
      expect(fn).toMatch(/LEFT JOIN "ContentPackage"/);
      expect(fn).toMatch(/packageGeo/);
      expect(fn).toMatch(/pkgKey/);
    }
  });

  it('assertTaskAccess accepts packageGeo and skips package SELECT when preloaded', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.controller.ts'),
      'utf8'
    );

    const start = src.indexOf('private async assertTaskAccess(');
    expect(start).toBeGreaterThan(0);
    const fn = src.slice(start);
    expect(fn).toMatch(/packageGeo\?/);
    expect(fn).toMatch(/geo === undefined/);
    expect(fn).toMatch(/geo === null/);
    expect(fn).toMatch(/contentPackage\.findUnique/);

    // Mutates that have joined geo pass it through.
    for (const action of ['complete', 'fail', 'cancel', 'reassign', 'getPerformance'] as const) {
      const fnStart = src.search(new RegExp(`async ${action}\\(\\s*@Param`));
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const aFn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 800);
      expect(aFn).toMatch(/getTaskAccessMeta\(safeId\)/);
      expect(aFn).toMatch(/access\.packageGeo/);
    }

    for (const action of ['update', 'delete'] as const) {
      const fnStart = src.search(new RegExp(`async ${action}\\(\\s*@Param`));
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const aFn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 800);
      expect(aFn).toMatch(/meta\.packageGeo/);
    }

    // Residual #167: detail / schedule / publish also fold packageGeo from getTaskRow JOIN.
    for (const action of ['getById', 'schedule', 'publish'] as const) {
      const fnStart = src.search(new RegExp(`async ${action}\\(\\s*@Param`));
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const aFn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 800);
      if (action === 'getById') {
        expect(aFn).toMatch(/assertTaskAccess\(detail\.packageId,\s*req,\s*detail\.packageGeo\)/);
      } else {
        expect(aFn).toMatch(/assertTaskAccess\(task\.packageId,\s*req,\s*task\.packageGeo\)/);
      }
    }
  });
});
