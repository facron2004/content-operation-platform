import { describe, expect, it } from 'vitest';

describe('residual #99 dead hasAttributions removal', () => {
  it('attribution.service has no single-row hasAttributions helper', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    expect(src).not.toMatch(/private\s+async\s+hasAttributions\s*\(/);
    expect(src).not.toMatch(
      /SELECT COUNT\(\*\) as cnt FROM "OrderAttribution" WHERE "taskId" = \? AND "method" = \?/
    );
    // Bulk probe remains the only path.
    expect(src).toContain('loadTaskIdsWithMethod');
    expect(src).toContain('SELECT DISTINCT "taskId"');
  });

  it('runRecompute still bulk-probes via loadTaskIdsWithMethod', async () => {
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
    expect(fn).not.toMatch(/await\s+this\.hasAttributions\s*\(/);
  });
});
