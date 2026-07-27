import { describe, expect, it } from 'vitest';

describe('residual #89 attribution recompute bulk hasDirect', () => {
  it('runRecompute bulk-probes direct OA instead of N× hasAttributions', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async runRecompute');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async purgePackageMismatched', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('loadTaskIdsWithMethod');
    expect(fn).toContain('runDirectAttribution');
    expect(fn).toContain('runTimeWindowAttribution');
    expect(fn).toContain('runFallbackAttribution');
    // No per-task COUNT probe inside recompute.
    expect(fn).not.toMatch(/await\s+this\.hasAttributions\s*\(/);
  });

  it('loadTaskIdsWithMethod uses DISTINCT + queryInChunks IN list', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async loadTaskIdsWithMethod');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**\n   * Upsert TaskPerformanceDaily', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('queryInChunks');
    expect(fn).toContain('SELECT DISTINCT "taskId"');
    expect(fn).toContain('OrderAttribution');
    expect(fn).toMatch(/"method"\s*=\s*\?/);
  });

  it('hasAttributions single-row helper is gone (residual #99)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    // Dead after #89 bulk probe; residual #99 deletes it so future code cannot regress.
    expect(src).not.toMatch(/private\s+async\s+hasAttributions\s*\(/);
    expect(src).toContain('loadTaskIdsWithMethod');
  });
});
