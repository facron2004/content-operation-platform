import { describe, expect, it } from 'vitest';

describe('residual #128 loadTaskFkBatch empty-leg skip + single-id probe', () => {
  it('loadIn short-circuits empty ids and equality-probes single ids', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async loadTaskFkBatch');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async assertOptionalTaskFks', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Empty legs never issue SQL.
    expect(fn).toMatch(/if\s*\(\s*!ids\.length\s*\)\s*return\s*\[\s*\]/);
    // Single-id path rewrites IN (__IN__) → = ?.
    expect(fn).toMatch(/ids\.length\s*===\s*1/);
    expect(fn).toContain("replace(/IN\\s*\\(\\s*__IN__\\s*\\)/i, '= ?')");
    // Multi-id IN path retained for batchCreate.
    expect(fn).toContain('__IN__');
    expect(fn).toContain('Promise.all');
  });
});
