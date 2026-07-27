import { describe, expect, it } from 'vitest';

describe('residual #165 DT update slim shell (drop fat free-form payload)', () => {
  it('update happy path uses $executeRawUnsafe + slim success shell; publish/schedule list shell', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(');
    expect(fnStart).toBeGreaterThan(0);
    const candidates = [
      src.indexOf('\n  async ', fnStart + 10),
      src.indexOf('\n  /**', fnStart + 10),
      src.indexOf('\n  private ', fnStart + 10)
    ].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 3500;
    const fn = src.slice(fnStart, next);

    // Residual #165: changed-rows + slim shell — no full-row payload.
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).not.toMatch(/return parseTask\(/);
    expect(fn).toMatch(/success:\s*true/);
    // Failure arm still freeze-projection only.
    expect(fn).toMatch(/const latest = await this\.getTaskUpdateMeta\(id\)/);
    // Residual #153: empty-set short-circuit synthesizes shell.
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
    // Status pin still present.
    expect(fn).toMatch(/"status" = \?/);

    // Residual #173: publish/schedule list shell (parity with fail/cancel).
    for (const fnName of ['async publish(', 'async schedule('] as const) {
      const pStart = src.indexOf(fnName);
      expect(pStart).toBeGreaterThan(0);
      const pCandidates = [
        src.indexOf('\n  async ', pStart + 10),
        src.indexOf('\n  /**', pStart + 10),
        src.indexOf('\n  private ', pStart + 10)
      ].filter((i) => i > 0);
      const pNext = pCandidates.length ? Math.min(...pCandidates) : pStart + 2500;
      const pFn = src.slice(pStart, pNext);
      expect(pFn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(pFn).toMatch(/return parseTask\(returned\[0\], \{ includeTrackingCode: false \}\)/);
    }
  });
});
