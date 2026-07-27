import { describe, expect, it } from 'vitest';

describe('residual #71 MerchantDailyMetrics area CTE', () => {
  it('MERCHANT_DAILY_METRICS_INSERT_SQL uses base + area_pick CTE, not correlated OrderHeader scan', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-query.ts'),
      'utf8'
    );
    expect(src).toContain('WITH base AS');
    expect(src).toContain('area_pick AS');
    expect(src).toMatch(/ROW_NUMBER\(\)\s*OVER\s*\(/);
    expect(src).toMatch(/PARTITION BY\s*"merchantName",\s*"dateKey"/);
    // No correlated re-scan of OrderHeader for areaName.
    expect(src).not.toMatch(/SELECT\s+oh2\."areaName"\s+FROM\s+"OrderHeader"\s+oh2/);
    // recompute binds exclusive paidTime bounds then updatedAt (matches ? order in SQL).
    expect(src).toMatch(
      /\$executeRawUnsafe\(\s*MERCHANT_DAILY_METRICS_INSERT_SQL,\s*paidStart,\s*paidEnd,\s*now\s*\)/
    );
    expect(src).toContain('sqlDatetimeExclusiveRange');
    expect(src).toContain('beijingDayRangeSqlite');
  });
});

describe('residual #71 stale-bucket heavy gate', () => {
  it('loadPlatformStaleBucketStats cold path uses withHeavyAggregateGate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'stale-bucket-stats.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toMatch(
      /getOrLoad\(cacheKey, false, \(\) =>\s*withHeavyAggregateGate\(\(\) => computePlatformStaleBucketStats/
    );
  });
});

describe('residual #71 refund cold heavy gate', () => {
  it('resolveWithCacheFallback wraps OH/DM loaders in heavy gate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'refund', 'refund-load.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toMatch(/HeavyAggregateQueueFullError/);
    expect(src).toMatch(/退款核销计算繁忙/);
    expect(src).toMatch(/getOrLoad\(o\.cacheKey, false, \(\) =>\s*withHeavyAggregateGate\(/);
  });
});

describe('residual #71 money throttle tighten', () => {
  it('GMV/refund/merchant-sales/dashboard interactive long throttle is 20/min', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const read = (rel: string) =>
      fs.readFile(path.join(__dirname, '..', 'src', ...rel.split('/')), 'utf8');
    const gmv = await read('gmv/gmv.controller.ts');
    const refund = await read('refund/refund.controller.ts');
    const ms = await read('merchant-sales/merchant-sales.controller.ts');
    const dash = await read('content/dashboard.controller.ts');
    // Interactive reads tightened to 20; export/refresh stay stricter.
    for (const [label, src] of [
      ['gmv', gmv],
      ['refund', refund],
      ['merchant-sales', ms],
      ['dashboard', dash]
    ] as const) {
      const twenties = (src.match(/limit:\s*20,\s*ttl:\s*60000/g) ?? []).length;
      expect(twenties, `${label} should have ≥1 long:20 throttle`).toBeGreaterThanOrEqual(1);
      // No leftover interactive 30 on these money/ops controllers (export is 3, refresh is 2).
      expect(src, `${label} must not keep long:30`).not.toMatch(
        /@Throttle\(\{\s*long:\s*\{\s*limit:\s*30,\s*ttl:\s*60000\s*\}\s*\}\)/
      );
    }
  });
});
