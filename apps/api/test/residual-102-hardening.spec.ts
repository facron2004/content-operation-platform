import { describe, expect, it } from 'vitest';

describe('residual #102 insertAttributions always binary-split + dead updatePerformance', () => {
  it('insertAttributions never serial-loops insertAttribution over a multi-row chunk', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async insertAttributions(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async insertAttribution(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Catch arm always binary-splits when chunk.length > 1.
    expect(fn).toContain('Math.ceil(chunk.length / 2)');
    expect(fn).toMatch(/chunk\.slice\(0,\s*mid\)/);
    expect(fn).toMatch(/chunk\.slice\(mid\)/);
    // Residual #102: no for-of serial salvage on the multi-row failure path.
    expect(fn).not.toMatch(
      /for\s*\(\s*const\s+orderId\s+of\s+chunk\s*\)[\s\S]{0,120}insertAttribution/
    );
    // Size-1 uses single-row helper (UNIQUE skip / manual rethrow / warn).
    expect(fn).toMatch(/chunk\.length\s*<=\s*1/);
    expect(fn).toMatch(/await this\.insertAttribution\(taskId,\s*chunk\[0\]/);
  });

  it('dead updatePerformance helper is gone; refreshTpdByTaskDays remains', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    expect(src).not.toMatch(/private\s+async\s+updatePerformance\s*\(/);
    expect(src).toContain('refreshTpdByTaskDays');
    expect(src).toContain('bulkRefreshTaskPerformanceDaily');
  });
});
