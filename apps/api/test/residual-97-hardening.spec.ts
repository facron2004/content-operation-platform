import { describe, expect, it } from 'vitest';

describe('residual #97 alert resolve multi-row INSERT ON CONFLICT', () => {
  it('resolveOperationAlerts uses multi-row INSERT (not N serial upserts)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'alert.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async resolveOperationAlerts(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**\n   * alertId shape is', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('RESOLVE_INSERT_CHUNK');
    expect(fn).toMatch(/VALUES\s+\$\{valueClauses\}/);
    expect(fn).toMatch(/ON CONFLICT\("alertId", "resolvedDate"\)/);
    // Must not map N upserts into $transaction(array).
    expect(fn).not.toMatch(
      /\$transaction\(\s*uniqueAlertIds\.map\(\s*\(alertId\)\s*=>\s*this\.upsertResolution/
    );
  });

  it('single resolve still uses upsertResolution helper', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'alert.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async resolveOperationAlert(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async resolveOperationAlerts(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toContain('upsertResolution');
  });
});
