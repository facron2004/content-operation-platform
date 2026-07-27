import { describe, expect, it } from 'vitest';

describe('residual #107 distribution-task mutate drop executions / status-only', () => {
  it('exposes getTaskRow / getTaskStatus / getTaskDeleteMeta helpers', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Residual #156: getTaskRow is public so controller can scope + preload.
    // Residual #159: getTaskDeleteMeta is public (packageId+status+publishedAt).
    expect(src).toMatch(/async getTaskRow\(/);
    expect(src).toMatch(/private async getTaskStatus\(/);
    expect(src).toMatch(/async getTaskDeleteMeta\(/);
    expect(src).toMatch(/t\."packageId", t\."status", t\."publishedAt"/);
    expect(src).toMatch(/LEFT JOIN "ContentPackage"/);
    // getById still loads executions for detail responses.
    const getByIdStart = src.indexOf('async getById(id: string)');
    expect(getByIdStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**\n   * Residual #107', getByIdStart + 10);
    const getById = src.slice(getByIdStart, next > 0 ? next : getByIdStart + 400);
    expect(getById).toMatch(/executionService\.findByTaskId/);
  });

  it('status-only transitions (complete/cancel/fail/reassign) never pre-load getById', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    for (const fnName of [
      'async fail(',
      'async cancel(',
      'async complete(',
      'async reassign('
    ] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      // Slice until next top-level method-ish async or private helper block.
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 1200;
      const fn = src.slice(fnStart, next);

      // Pre-check + failure arm use status probe, not full getById.
      // Residual #140/#146: success hydrates via slim RETURNING (no free-form body/cta).
      expect(fn).toMatch(/getTaskStatus\(/);
      expect(fn).not.toMatch(/await this\.getById\(id\)/);
      expect(fn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(fn).toMatch(/return parseTask\(returned\[0\], \{ includeTrackingCode: false \}\)/);
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
    }
  });

  it('update/publish/schedule use getTaskRow (no executions); delete uses delete meta', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Residual #129: update pre-load is freeze/FK projection (getTaskUpdateMeta).
    // Residual #165: happy path is $executeRawUnsafe slim shell (no RETURNING free-form).
    // Residual #153: empty-set short-circuit synthesizes shell (no getTaskRow re-SELECT).
    // Residual #156: optional preloadedMeta falls back to getTaskUpdateMeta.
    const updateStart = src.indexOf('async update(');
    expect(updateStart).toBeGreaterThan(0);
    const updateCandidates = [
      src.indexOf('\n  async ', updateStart + 10),
      src.indexOf('\n  /**', updateStart + 10),
      src.indexOf('\n  private ', updateStart + 10)
    ].filter((i) => i > 0);
    const updateNext = updateCandidates.length ? Math.min(...updateCandidates) : updateStart + 2500;
    const updateFn = src.slice(updateStart, updateNext);
    expect(updateFn).toMatch(/getTaskUpdateMeta\(/);
    expect(updateFn).toMatch(/preloadedMeta \?\? \(await this\.getTaskUpdateMeta\(id\)\)/);
    expect(updateFn).toMatch(/if \(sets\.length === 0\)/);
    expect(updateFn).not.toMatch(/if \(sets\.length === 0\) return this\.getTaskRow\(id\)/);
    expect(updateFn).not.toMatch(/return this\.getTaskRow\(id\)/);
    expect(updateFn).toMatch(/\$executeRawUnsafe/);
    expect(updateFn).not.toMatch(/\bRETURNING\b/);
    expect(updateFn).toMatch(/success:\s*true/);
    expect(updateFn).not.toMatch(/const (existing|task) = await this\.getById\(id\)/);
    expect(updateFn).not.toMatch(/const existing = await this\.getTaskRow\(id\)/);

    // Residual #173: publish/schedule RETURN list shell (SPA merge + timeline re-GET).
    for (const fnName of ['async publish(', 'async schedule('] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
      const fn = src.slice(fnStart, next);

      // Residual #156: optional preloadedTask falls back to getTaskRow.
      expect(fn).toMatch(/preloadedTask \?\? \(await this\.getTaskRow\(id\)\)/);
      expect(fn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(fn).toMatch(/return parseTask\(returned\[0\], \{ includeTrackingCode: false \}\)/);
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
      // No pre-check full getById.
      expect(fn).not.toMatch(/const (existing|task) = await this\.getById\(id\)/);
    }

    // Residual #159: optional preloadedMeta; fallback getTaskDeleteMeta.
    const delStart = src.indexOf('async delete(');
    expect(delStart).toBeGreaterThan(0);
    const delNextCandidates = [
      src.indexOf('\n  async ', delStart + 10),
      src.indexOf('\n  /**', delStart + 10)
    ].filter((i) => i > 0);
    const delNext = delNextCandidates.length ? Math.min(...delNextCandidates) : delStart + 1200;
    const del = src.slice(delStart, delNext);
    expect(del).toMatch(/preloadedMeta \?\? \(await this\.getTaskDeleteMeta\(id\)\)/);
    expect(del).not.toMatch(/await this\.getById\(id\)/);
  });
});
