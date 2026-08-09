import { describe, expect, it } from 'vitest';
import { GMV_TOP_MERCHANTS_LIMIT } from '../src/common/sql-chunk';

describe('residual #72 refund top-merchants page-less + SQL LIMIT', () => {
  it('fetchTopMerchantsRaw orders + LIMITs; cache key omits page', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const top = await fs.readFile(
      path.join(__dirname, '..', 'src', 'refund', 'refund-top-merchants.ts'),
      'utf8'
    );
    const load = await fs.readFile(
      path.join(__dirname, '..', 'src', 'refund', 'refund-load.ts'),
      'utf8'
    );
    expect(top).toContain('GMV_TOP_MERCHANTS_LIMIT');
    expect(top).toMatch(/ORDER BY \$\{orderColumn\} DESC/);
    expect(top).toMatch(/LIMIT \?/);
    expect(top).toContain('queryAllTopMerchants');
    // page-less aggregate key
    expect(load).toMatch(
      /cacheKey:\s*`refundTopMerchants:\$\{q\.sortBy\}:\$\{q\.window \?\? 'week'\}:\$\{q\.date \?\? 'today'\}`/
    );
    expect(load).not.toMatch(/refundTopMerchants:\$\{q\.sortBy\}:\$\{q\.page\}:\$\{q\.pageSize\}/);
    expect(load).toContain('queryAllTopMerchants');
    expect(load).toContain('pageTopMerchants');
    expect(GMV_TOP_MERCHANTS_LIMIT).toBe(1_000);
  });
});

describe('residual #72 merchant-sales export heavy gate', () => {
  it('getExport wraps queryExportCsv in withHeavyAggregateGate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-surface.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toMatch(/withHeavyAggregateGate\(\(\) =>\s*queryExportCsv\(/);
    expect(src).toMatch(/商家销售导出繁忙/);
  });
});

describe('residual #72 stale-bucket PSD date bound', () => {
  it('PackageSalesDaily join bounds s.date to stale60 lookback', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'stale-bucket-stats.ts'),
      'utf8'
    );
    expect(src).toContain('shiftDateKey');
    expect(src).toContain('salesFrom');
    expect(src).toMatch(/s\."date"\s*>=\s*\?/);
    expect(src).toMatch(/stale60Days/);
  });
});

describe('residual #72 community performance 90d task counts', () => {
  it('getPerformance bounds DistributionTask counts to interactive window', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    // Task status counts must carry exclusive createdAt window (not unbounded full history).
    expect(src).toMatch(
      /FROM "DistributionTask"\s+WHERE "groupId" = \?\s+AND \$\{sqlDatetimeExclusiveRange\('"createdAt"'\)\}/
    );
    expect(src).toContain('INTERACTIVE_LIST_MAX_DAYS');
    expect(src).toContain('beijingDayRangeSqlite');
  });
});
