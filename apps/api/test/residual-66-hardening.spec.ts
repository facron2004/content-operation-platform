import { describe, expect, it } from 'vitest';
import {
  emptyStaleBucketStats,
  stale30SkuCountFromBuckets
} from '../src/common/stale-bucket-stats';
import { PLATFORM_SCAN_LIMIT, DATA_ANALYSIS_OH_CONCURRENCY } from '../src/common/sql-chunk';

describe('residual #66 overview KPI reuses shared stale histogram', () => {
  it('aggregateStaleSkuStats uses loadPlatformStaleBucketStats + merchant DISTINCT only', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview-stale.ts'),
      'utf8'
    );
    expect(src).toContain('loadPlatformStaleBucketStats');
    expect(src).toContain('stale30SkuCountFromBuckets');
    // Must not COUNT(*) the full stale set for SKU KPI (histogram covers that).
    expect(src).not.toMatch(/COUNT\(\*\) AS "stale30SkuCount"/);
    // Merchant DISTINCT still needed (histogram has no merchant dim).
    expect(src).toMatch(/COUNT\(DISTINCT "merchantId"\) AS "distinctMerchants"/);
  });

  it('stale30SkuCountFromBuckets sums 30d + 60d buckets', () => {
    expect(
      stale30SkuCountFromBuckets({
        ...emptyStaleBucketStats(),
        stale_30d: 3,
        stale_60d: 7,
        stale_7d: 100
      })
    ).toBe(10);
  });
});

describe('residual #66 zero-sales daysSince reuses lastSalesDate', () => {
  it('daysSince computed in JS from batch lastSalesDate (no correlated MAX pair)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-sku-loaders.ts'),
      'utf8'
    );
    // residual #78: zeroSalesDaysSince in JS; batch metrics use one MAX per IN-chunk GROUP BY.
    expect(src).toContain('zeroSalesDaysSince');
    expect(src).toContain('mapZeroSalesSkuCandidates');
    // No outer julianday correlated pair (removed with buildZeroSalesSkuSelectSql).
    expect(src).not.toMatch(/julianday\(\?\) - julianday\("lastSalesDate"\)/);
    expect(src).not.toMatch(/julianday\(\?\) - julianday\(\(\s*SELECT MAX\(s2/);
    // No per-row correlated last-sale subquery on ContentPackage alias.
    expect(src).not.toMatch(
      /SELECT MAX\(s\."date"\)\s+FROM "PackageSalesDaily" s\s+WHERE s\."packageId" = cp\."packageId"/
    );
  });
});

describe('residual #66 GMV today OH mapPool', () => {
  it('computeFromOrderHeader uses mapPool not bare Promise.all', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv-order-header-today.ts'),
      'utf8'
    );
    expect(src).toContain('mapPool');
    expect(src).toContain('DATA_ANALYSIS_OH_CONCURRENCY');
    expect(DATA_ANALYSIS_OH_CONCURRENCY).toBe(2);
    expect(src).not.toMatch(/await Promise\.all\(\[\s*queryOrderHeaderGmv/);
  });
});

describe('residual #66 heatmap coords by merchant-id chunks', () => {
  it('loads coords via loadCoordsByMerchantId not full Merchant scan', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-heatmap.ts'),
      'utf8'
    );
    expect(src).toContain('loadCoordsByMerchantId');
    expect(src).toMatch(/merchantId" IN \(/);
    // Must not full-scan Merchant WHERE lat IS NOT NULL LIMIT PLATFORM_SCAN.
    expect(src).not.toMatch(
      /FROM "Merchant"\s+WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL\s+LIMIT \?/
    );
  });
});

describe('residual #66 external catalog PLATFORM_SCAN_LIMIT cap', () => {
  it('data-source caps pages + mergedList + packages', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'jeesite-data-source.client.ts'),
      'utf8'
    );
    expect(src).toContain('PLATFORM_SCAN_LIMIT');
    expect(src).toContain('EXTERNAL_MAX_PAGES');
    expect(src).toMatch(/mergedList\.length = PLATFORM_SCAN_LIMIT/);
    expect(src).toMatch(/packages\.slice\(0,\s*PLATFORM_SCAN_LIMIT\)/);
    expect(PLATFORM_SCAN_LIMIT).toBe(10_000);
  });
});
