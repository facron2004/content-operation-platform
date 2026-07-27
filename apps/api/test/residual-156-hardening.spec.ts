import { describe, expect, it } from 'vitest';

describe('residual #156 DT update/publish/schedule preload fold', () => {
  it('getTaskUpdateMeta + getTaskRow are public controller-facing probes', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Public (no private keyword immediately before).
    const metaStart = src.indexOf('async getTaskUpdateMeta(');
    expect(metaStart).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, metaStart - 20), metaStart)).not.toMatch(/private\s+$/);

    const rowStart = src.indexOf('async getTaskRow(');
    expect(rowStart).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, rowStart - 20), rowStart)).not.toMatch(/private\s+$/);

    // Freeze projection columns still present.
    expect(src).toMatch(
      /t\."status", t\."publishedAt", t\."packageId", t\."contentId", t\."campaignId", t\."groupId", t\."fallbackPackageId"/
    );
    expect(src).toMatch(/LEFT JOIN "ContentPackage"/);
  });

  it('service accepts optional preloaded meta/task; falls back to own probe', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const updateStart = src.indexOf('async update(');
    expect(updateStart).toBeGreaterThan(0);
    const updateCandidates = [
      src.indexOf('\n  async ', updateStart + 10),
      src.indexOf('\n  /**', updateStart + 10),
      src.indexOf('\n  private ', updateStart + 10)
    ].filter((i) => i > 0);
    const updateFn = src.slice(
      updateStart,
      updateCandidates.length ? Math.min(...updateCandidates) : updateStart + 3000
    );
    expect(updateFn).toMatch(/preloadedMeta\?/);
    expect(updateFn).toMatch(/preloadedMeta \?\? \(await this\.getTaskUpdateMeta\(id\)\)/);

    for (const fnName of ['async publish(', 'async schedule('] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const fn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 2500);
      expect(fn).toMatch(/preloadedTask\?/);
      expect(fn).toMatch(/preloadedTask \?\? \(await this\.getTaskRow\(id\)\)/);
    }
  });

  it('controller folds scope probe into service preload for update/publish/schedule', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.controller.ts'),
      'utf8'
    );

    // update: freeze meta → scope → update(..., meta)
    {
      const fnStart = src.search(/async update\(\s*@Param/);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const fn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 800);
      expect(fn).toMatch(/getTaskUpdateMeta\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(meta\.packageId/);
      expect(fn).toMatch(/this\.svc\.update\(safeId, body, meta\)/);
      // No separate packageId probe.
      expect(fn).not.toMatch(/getTaskPackageId/);
      expect(fn).not.toMatch(/getById\(safeId\)/);
    }

    // schedule: getTaskRow → scope (with packageGeo) → schedule(..., task)
    {
      const fnStart = src.search(/async schedule\(\s*@Param/);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const fn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 800);
      expect(fn).toMatch(/getTaskRow\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(task\.packageId,\s*req,\s*task\.packageGeo\)/);
      expect(fn).toMatch(/this\.svc\.schedule\(safeId, body\.plannedAt, task\)/);
      expect(fn).not.toMatch(/getTaskPackageId/);
      expect(fn).not.toMatch(/getById\(safeId\)/);
    }

    // publish: getTaskRow → scope (with packageGeo) → publish(..., task)
    {
      const fnStart = src.search(/async publish\(\s*@Param/);
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const fn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 900);
      expect(fn).toMatch(/getTaskRow\(safeId\)/);
      expect(fn).toMatch(/assertTaskAccess\(task\.packageId,\s*req,\s*task\.packageGeo\)/);
      // Third arg is the preloaded task.
      expect(fn).toMatch(/this\.svc\.publish\([\s\S]*?,\s*task\s*\)/);
      expect(fn).not.toMatch(/getTaskPackageId/);
      expect(fn).not.toMatch(/getById\(safeId\)/);
    }

    // Status mutates + delete + performance keep their own probes (not folded here).
    for (const action of ['complete', 'fail', 'cancel', 'reassign'] as const) {
      const fnStart = src.search(new RegExp(`async ${action}\\(\\s*@Param`));
      expect(fnStart).toBeGreaterThan(0);
      const nextRoles = src.indexOf('\n  @Roles(', fnStart + 10);
      const nextGet = src.indexOf('\n  @Get(', fnStart + 10);
      const nextPrivate = src.indexOf('\n  private ', fnStart + 10);
      const candidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
      const fn = src.slice(fnStart, candidates.length ? Math.min(...candidates) : fnStart + 800);
      expect(fn).toMatch(/getTaskAccessMeta\(safeId\)/);
    }
  });
});
