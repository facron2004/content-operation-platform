import { describe, expect, it } from 'vitest';

describe('residual #116 DT status-mutate success without executions', () => {
  it('fail/cancel/complete/reassign success hydrate via RETURNING (not getById)', async () => {
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
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 1200;
      const fn = src.slice(fnStart, next);

      // Residual #140/#146: success path is slim UPDATE ... RETURNING (list shell).
      expect(fn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(fn).toMatch(/return parseTask\(returned\[0\], \{ includeTrackingCode: false \}\)/);
      expect(fn).not.toMatch(/return this\.getById\(id\)/);
      expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
      // Still status-only pre-check from #107.
      expect(fn).toMatch(/getTaskStatus\(/);
    }
  });

  it('GET detail getById still loads executions timeline', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const getByIdStart = src.indexOf('async getById(id: string)');
    expect(getByIdStart).toBeGreaterThan(0);
    const getById = src.slice(getByIdStart, getByIdStart + 300);
    expect(getById).toMatch(/getTaskRow\(id\)/);
    expect(getById).toMatch(/executionService\.findByTaskId/);
  });
});
