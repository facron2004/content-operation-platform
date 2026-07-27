import { describe, expect, it } from 'vitest';

describe('residual #118 DT publish/schedule/update success without executions', () => {
  it('update/publish/schedule success hydrate via RETURNING (not getById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Residual #165: update happy path is slim shell (SPA form discards body).
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
      expect(fn).not.toMatch(/return this\.getById\(id\)/);
      // Residual #129: update pre-load is getTaskUpdateMeta.
      // Residual #153: empty-set short-circuit synthesizes shell (no getTaskRow).
      // Residual #156: optional preloaded* falls back to the same probes.
      expect(fn).toMatch(/preloadedMeta \?\? \(await this\.getTaskUpdateMeta\(id\)\)/);
      expect(fn).toMatch(/if \(sets\.length === 0\)/);
      expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getTaskRow\(id\)/);
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
    }

    // Residual #173: publish/schedule list shell (SPA merge + timeline re-GET).
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

      // Residual #140/#173: happy-path write is UPDATE ... RETURNING list shell.
      expect(fn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(fn).toMatch(/return parseTask\(returned\[0\], \{ includeTrackingCode: false \}\)/);
      expect(fn).not.toMatch(/return this\.getById\(id\)/);
      expect(fn).toMatch(/preloadedTask \?\? \(await this\.getTaskRow\(id\)\)/);
      // Pre-load only — success path must not re-fetch.
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
    }
  });

  it('all service mutate success paths avoid getById', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // After #116+#118+#122+#140 no mutate/create success path reloads executions via getById.
    for (const fnName of [
      'async create(',
      'async update(',
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
      expect(fn).not.toMatch(/return this\.getById\(/);
    }
  });
});
