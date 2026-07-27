import { describe, expect, it } from 'vitest';

describe('residual #73 attribution batch insert', () => {
  it('automated tiers call insertAttributions; batch uses UNION ALL NOT EXISTS', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    expect(src).toContain('insertAttributions');
    expect(src).toMatch(/runDirectAttribution[\s\S]*?insertAttributions\(/);
    expect(src).toMatch(/runTimeWindowAttribution[\s\S]*?insertAttributions\(/);
    expect(src).toMatch(/runFallbackAttribution[\s\S]*?insertAttributions\(/);
    // No per-order sequential insert in automated tiers.
    expect(src).not.toMatch(/for \(const order of orders\) \{\s*await this\.insertAttribution/);
    expect(src).toMatch(/UNION ALL/);
    expect(src).toMatch(/WHERE NOT EXISTS/);
  });
});

describe('residual #73 performance aggregation bulk scans', () => {
  it('aggregatePerformance bulk-loads visits + OA then upserts', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    // residual #87 moved bulk scans into task-performance-daily.ts;
    // job calls bulkRefreshTaskPerformanceDaily (2 scans + multi-row upsert).
    const jobSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'jobs', 'performance-aggregation.job.ts'),
      'utf8'
    );
    expect(jobSrc).toContain('bulkRefreshTaskPerformanceDaily');

    const helperSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'task-performance-daily.ts'),
      'utf8'
    );
    expect(helperSrc).toContain('loadTpdVisitCountsByCode');
    expect(helperSrc).toContain('loadTpdAttrAggregatesByTask');
    expect(helperSrc).toContain('queryInChunks');
    expect(helperSrc).toMatch(/GROUP BY "trackingCode"/);
    expect(helperSrc).toMatch(/GROUP BY oa\."taskId"/);
    expect(helperSrc).toContain('batchUpsertTaskPerformanceDaily');
  });
});
