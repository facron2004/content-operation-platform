import { describe, expect, it } from 'vitest';

describe('residual #125 dashboard GROUP BY auditStatus', () => {
  it('computeDashboardSummary groups GeneratedCopy by auditStatus (no N× count)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async computeDashboardSummary(');
    expect(fnStart).toBeGreaterThan(0);
    // End at statusDistribution (next public method after computeDashboardSummary).
    const next = src.indexOf('\n  statusDistribution(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 2500);

    // Residual #125 shape.
    expect(fn).toMatch(/GROUP BY "auditStatus"/);
    expect(fn).toMatch(/FROM "GeneratedCopy"/);
    expect(fn).toMatch(/COUNT\(\*\) as "rowCount"/);
    // Must not pay N× Prisma count for platform counters (call sites only).
    expect(fn).not.toMatch(/this\.prisma\.generatedCopy\.count/);
    expect(fn).not.toMatch(/this\.prisma\.copyPerformance\.count/);
    expect(fn).not.toMatch(/countJobs/);
  });
});
