import { describe, expect, it } from 'vitest';

describe('residual #140 DT mutator UPDATE ... RETURNING', () => {
  it('field mutators hydrate via full RETURNING; status mutators use slim shell', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Residual #165: update happy path slim shell (SPA form discards body).
    {
      const fnStart = src.indexOf('async update(');
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/\$executeRawUnsafe/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
      expect(fn).toMatch(/success:\s*true/);
      // Residual #153: empty-set synthesizes shell (no getTaskRow re-SELECT).
      expect(fn).toMatch(/if \(sets\.length === 0\)/);
      expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getTaskRow\(id\)/);
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
      expect(fn).not.toMatch(/return this\.getById\(id\)/);
    }

    // Residual #173: publish/schedule list shell (parity with fail/cancel).
    for (const fnName of [
      'async publish(',
      'async schedule(',
      'async fail(',
      'async cancel(',
      'async complete(',
      'async reassign('
    ] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/\$queryRawUnsafe/);
      expect(fn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(fn).toMatch(/return parseTask\(returned\[0\], \{ includeTrackingCode: false \}\)/);
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
      expect(fn).not.toMatch(/return this\.getById\(id\)/);
    }
  });

  it('TASK_STATUS_MUTATE_COLUMNS imported for status-mutate RETURNING map', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    // Residual #173: TASK_ROW_COLUMNS no longer needed in service (detail in query module).
    expect(src).toMatch(/TASK_STATUS_MUTATE_COLUMNS/);
    expect(src).not.toMatch(/TASK_ROW_COLUMNS/);
    expect(src).toMatch(/type TaskRow/);
  });
});
