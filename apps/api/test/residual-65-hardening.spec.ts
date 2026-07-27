import { describe, expect, it } from 'vitest';
import {
  DATA_ANALYSIS_OH_CONCURRENCY,
  mapPool,
  QUERY_IN_CHUNKS_CONCURRENCY
} from '../src/common/sql-chunk';
import {
  emptyStaleBucketStats,
  stale30SkuCountFromBuckets,
  STALE_BUCKET_KEYS
} from '../src/common/stale-bucket-stats';

describe('residual #65 mapPool + data-analysis concurrency', () => {
  it('exports OH concurrency bound and preserves mapPool order', async () => {
    expect(DATA_ANALYSIS_OH_CONCURRENCY).toBe(2);
    expect(DATA_ANALYSIS_OH_CONCURRENCY).toBe(QUERY_IN_CHUNKS_CONCURRENCY);
    const started: number[] = [];
    const results = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      await new Promise((r) => setTimeout(r, 5));
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    // All items processed (order of start may vary under concurrency).
    expect(started.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('data-analysis.service uses mapPool not bare Promise.all for OH matrix', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'data-analysis', 'data-analysis.service.ts'),
      'utf8'
    );
    expect(src).toContain('mapPool');
    expect(src).toContain('DATA_ANALYSIS_OH_CONCURRENCY');
    // Must not Promise.all the multi-query OH matrix.
    expect(src).not.toMatch(/await Promise\.all\(\[\s*queryOverview/);
    expect(src).not.toMatch(/await Promise\.all\(\[\s*\n\s*queryOverview/);
  });
});

describe('residual #65 shared stale-bucket stats', () => {
  it('exports empty stats + stale30 helper', () => {
    const empty = emptyStaleBucketStats();
    expect(empty.normal).toBe(0);
    expect(empty.stale_60d).toBe(0);
    expect(STALE_BUCKET_KEYS).toContain('stale_30d');
    expect(
      stale30SkuCountFromBuckets({
        normal: 10,
        stale_7d: 2,
        stale_15d: 3,
        stale_30d: 4,
        stale_60d: 5
      })
    ).toBe(9);
  });

  it('movement-today + overview-stale both call loadPlatformStaleBucketStats', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const mov = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement-today.ts'),
      'utf8'
    );
    const overview = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview-stale.ts'),
      'utf8'
    );
    const shared = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'stale-bucket-stats.ts'),
      'utf8'
    );
    expect(shared).toContain('loadPlatformStaleBucketStats');
    expect(shared).toContain('staleBucketCache');
    expect(shared).toMatch(/getOrLoad/);
    expect(mov).toContain('loadPlatformStaleBucketStats');
    expect(mov).not.toContain('loadBucketDistributionSql');
    expect(overview).toContain('loadPlatformStaleBucketStats');
    // overview no longer embeds its own full-catalog CASE SQL
    expect(overview).not.toMatch(/julianday\(\?\) - julianday\(last_sale\)/);
  });
});

describe('residual #65 zero-sales filter-first SQL', () => {
  it('drops global last_sale + sales_30d CTEs (movement-style candidates)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-loaders.ts'),
      'utf8'
    );
    // residual #78: candidate + batch enrich (no correlated SELECT SQL builder).
    expect(src).toContain('loadZeroSalesSkuCandidates');
    expect(src).toContain('loadZeroSalesSkuMetricsByPackage');
    // No full-catalog CTEs.
    expect(src).not.toMatch(/WITH last_sale AS/);
    expect(src).not.toMatch(/sales_30d AS \(/);
    // Batch metrics via GROUP BY packageId (not per-row correlated subqueries).
    expect(src).toMatch(/GROUP BY s\."packageId"/);
    expect(src).toContain('queryInChunks');
    // Candidate ORDER BY packageId only.
    expect(src).toMatch(/ORDER BY cp\."packageId" ASC/);
  });
});

describe('residual #65 dashboard summary getOrLoad', () => {
  it('caches unrestricted summary COUNTs via opsCache', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.service.ts'),
      'utf8'
    );
    expect(src).toContain('computeDashboardSummary');
    expect(src).toMatch(/ops:summary/);
    expect(src).toMatch(/opsCache\.getOrLoad/);
    // Scoped path must not share unrestricted summary key.
    expect(src).toMatch(/includePlatformCounters/);
    expect(src).toMatch(/computeDashboardSummary\(getRecommendations,\s*false\)/);
  });
});
