import { describe, expect, it } from 'vitest';

describe('residual #92 manualBind/revoke bulk TPD', () => {
  it('manualBind uses refreshTpdByTaskDays (not N× updatePerformance)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async manualBind(dto: ManualBindDto)');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /** Revoke an attribution', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('refreshTpdByTaskDays');
    expect(fn).not.toMatch(/await\s+this\.updatePerformance\s*\(/);
  });

  it('revoke uses refreshTpdByTaskDays (not direct updatePerformance)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async revoke(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  // ─── Helpers', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('refreshTpdByTaskDays');
    expect(fn).not.toMatch(/await\s+this\.updatePerformance\s*\(/);
  });

  it('refreshTpdByTaskDays groups by day + bulkRefresh + batch trackingCode load', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async refreshTpdByTaskDays');
    expect(fnStart).toBeGreaterThan(0);
    // Residual #102: dead updatePerformance removed — next private is windowEnd.
    const next = src.indexOf('\n  private windowEnd', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('bulkRefreshTaskPerformanceDaily');
    expect(fn).toContain('queryInChunks');
    expect(fn).toContain('trackingCode');
    expect(fn).toContain('byDay');
  });

  it('updatePerformance single-row wrapper is gone (residual #102)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    // Dead after #92 bulk TPD; residual #102 deletes so future code cannot regress.
    expect(src).not.toMatch(/private\s+async\s+updatePerformance\s*\(/);
    expect(src).toContain('refreshTpdByTaskDays');
  });
});
