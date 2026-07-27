import { describe, expect, it } from 'vitest';

describe('residual #167 packageGeo fold into getTaskRow / detail / schedule / publish', () => {
  it('findTaskRow LEFT JOINs ContentPackage and returns packageGeo', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function findTaskRow(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\nexport ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 1500);

    expect(fn).toMatch(/LEFT JOIN "ContentPackage"/);
    expect(fn).toMatch(/pkgKey/);
    expect(fn).toMatch(/packageGeo/);
    expect(fn).toMatch(/WHERE t\."taskId" = \?/);
    // Must not be bare single-table SELECT of unprefixed TASK_ROW_COLUMNS only.
    expect(fn).not.toMatch(/SELECT \$\{TASK_ROW_COLUMNS\} FROM "DistributionTask" WHERE "taskId"/);
  });

  it('getTaskRow / getById expose packageGeo; controller passes it and strips from SPA body', async () => {
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

    const rowStart = service.indexOf('async getTaskRow(');
    expect(rowStart).toBeGreaterThan(0);
    const rowNext = service.indexOf('\n  /**', rowStart + 10);
    const rowFn = service.slice(rowStart, rowNext > 0 ? rowNext : rowStart + 800);
    expect(rowFn).toMatch(/packageGeo/);
    expect(rowFn).toMatch(/parseTask\(task/);

    const byIdStart = service.indexOf('async getById(');
    expect(byIdStart).toBeGreaterThan(0);
    const byIdNext = service.indexOf('\n  /**', byIdStart + 10);
    const byIdFn = service.slice(byIdStart, byIdNext > 0 ? byIdNext : byIdStart + 400);
    expect(byIdFn).toMatch(/packageGeo/);

    for (const action of ['getById', 'schedule', 'publish'] as const) {
      const needle = action === 'getById' ? 'async getById(@Param' : `async ${action}(@Param`;
      const fnStart = controller.indexOf(needle);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = controller.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = controller.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = controller.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const fn = controller.slice(
        fnStart,
        candidates.length ? Math.min(...candidates) : fnStart + 900
      );
      if (action === 'getById') {
        expect(fn).toMatch(/assertTaskAccess\(detail\.packageId,\s*req,\s*detail\.packageGeo\)/);
        // SPA body must not include packageGeo.
        expect(fn).toMatch(/packageGeo:\s*_geo/);
      } else {
        expect(fn).toMatch(/assertTaskAccess\(task\.packageId,\s*req,\s*task\.packageGeo\)/);
      }
    }
  });
});
