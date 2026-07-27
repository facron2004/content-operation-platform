import { describe, expect, it } from 'vitest';

describe('residual #173 DT publish/schedule list-shell RETURNING', () => {
  it('publish/schedule RETURN list shell (no free-form / trackingCode)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

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

      // Residual #173: list shell parity with fail/cancel/complete.
      expect(fn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(fn).not.toMatch(/RETURNING \$\{TASK_ROW_COLUMNS\}/);
      expect(fn).toMatch(/return parseTask\(returned\[0\], \{ includeTrackingCode: false \}\)/);
      expect(fn).not.toMatch(/includeTrackingCode: true/);
      // Pre-load still needs free-form for integrity gates; success path no re-fetch.
      expect(fn).toMatch(/preloadedTask \?\? \(await this\.getTaskRow\(id\)\)/);
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
      expect(fn).not.toMatch(/return this\.getById\(id\)/);
    }
  });

  it('service no longer imports TASK_ROW_COLUMNS (detail only in query module)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    expect(src).toMatch(/TASK_STATUS_MUTATE_COLUMNS/);
    expect(src).not.toMatch(/TASK_ROW_COLUMNS/);
  });
});
