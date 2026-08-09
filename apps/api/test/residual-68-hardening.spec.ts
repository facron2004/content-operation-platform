import { describe, expect, it } from 'vitest';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../src/common/heavy-aggregate-gate';
import { QUERY_IN_CHUNKS_CONCURRENCY } from '../src/common/sql-chunk';

describe('residual #68 movement membership filter-first SQL', () => {
  it('loadActiveSkus supports salesWindow EXISTS/NOT EXISTS', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const skus = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement-sku-loaders.ts'),
      'utf8'
    );
    const list = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement-list.ts'),
      'utf8'
    );
    expect(skus).toContain('ActiveSkuSalesWindow');
    expect(skus).toMatch(/salesWindow/);
    expect(skus).toMatch(/mode === 'moving'/);
    expect(skus).toMatch(/EXISTS \(/);
    expect(skus).toMatch(/NOT \$\{predicate\}|AND NOT /);
    // computeMoving/Stagnant use salesWindow instead of fetchMovingPackageIds.
    expect(list).toMatch(/salesWindow:\s*\{\s*mode:\s*'moving'/);
    expect(list).toMatch(/salesWindow:\s*\{\s*mode:\s*'stagnant'/);
    expect(list).not.toContain('fetchMovingPackageIds');
  });
});

describe('residual #68 merchant-list single-pass metrics', () => {
  it('collectMerchantMetricMaps uses CTE join not package materialize', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-metrics.ts'),
      'utf8'
    );
    expect(src).toMatch(/WITH pkgs AS/);
    expect(src).toMatch(/stale30SkuCount/);
    // Must not findMany packages then chunk PackageSalesDaily by packageId.
    expect(src).not.toMatch(/contentPackage\.findMany/);
    expect(src).not.toMatch(/loadPackagesForMerchants/);
    expect(src).not.toMatch(/loadRecentSalesPackageIds/);
  });

  it('listMerchantRows totalSku counts stockLeft > 0 only', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-queries.ts'),
      'utf8'
    );
    // totalSku filter aligns with enrich pkgs CTE (stockLeft > 0).
    expect(src).toMatch(/filters\.push\(`"stockLeft" > 0`\)|"stockLeft" > 0/);
    // listMerchantRows SQL still GROUP BY merchantId with COUNT.
    expect(src).toMatch(/COUNT\(\*\) AS "totalSku"/);
  });
});

describe('residual #68 cold heavy-list throttle tighten', () => {
  it('movement/zero-sales/merchant cold lists use long limit 10', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const mov = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement.controller.ts'),
      'utf8'
    );
    const zs = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales.controller.ts'),
      'utf8'
    );
    const mer = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant.controller.ts'),
      'utf8'
    );
    // Cold aggregate routes tightened to 10/min.
    expect(mov).toMatch(/skus\/moving[\s\S]{0,120}limit:\s*10/);
    expect(mov).toMatch(/skus\/stagnant[\s\S]{0,120}limit:\s*10/);
    expect(zs).toMatch(
      /merchants[\s\S]{0,200}limit:\s*10|limit:\s*10[\s\S]{0,80}@Get\('merchants'\)/
    );
    expect(zs).toMatch(
      /limit:\s*10[\s\S]{0,80}@Get\('skus'\)|@Get\('skus'\)[\s\S]{0,80}limit:\s*10/
    );
    expect(mer).toMatch(/limit:\s*10[\s\S]{0,80}@Get\(\)|@Get\(\)[\s\S]{0,80}limit:\s*10/);
    expect(mer).toMatch(/heatmap[\s\S]{0,120}limit:\s*10|limit:\s*10[\s\S]{0,80}@Get\('heatmap'\)/);
    // Export stays tight.
    expect(mov).toMatch(/limit:\s*3/);
    expect(zs).toMatch(/limit:\s*3/);
  });
});

describe('residual #68 opsCache lowered maxSize', () => {
  it('DashboardService opsCache uses HEAVY_LIST_CACHE_MAX_SIZE', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard-operations.service.ts'),
      'utf8'
    );
    expect(src).toContain('HEAVY_LIST_CACHE_MAX_SIZE');
    expect(src).toMatch(/new TtlCache\(DASHBOARD_OPS_TTL_MS,\s*HEAVY_LIST_CACHE_MAX_SIZE\)/);
    expect(HEAVY_LIST_CACHE_MAX_SIZE).toBe(64);
  });
});

describe('residual #68 data-analysis heavy gate', () => {
  it('getSummary + exportExcel cold paths use withHeavyAggregateGate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'data-analysis', 'data-analysis.service.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toMatch(/summaryCache\.getOrLoad[\s\S]{0,200}withHeavyAggregateGate/);
    expect(src).toMatch(/async exportExcel\([\s\S]*?withHeavyAggregateGate\(/);
    expect(src).toMatch(/HeavyAggregateQueueFullError/);
    expect(src).toMatch(/数据分析计算繁忙|数据分析导出繁忙/);
  });
});

describe('residual #68 external fetch concurrency default 2', () => {
  it('defaults to 2 and hard-caps at 4', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'jeesite-data-source.client.ts'),
      'utf8'
    );
    expect(src).toMatch(/EXTERNAL_FETCH_CONCURRENCY \?\? 2/);
    expect(src).toMatch(/Math\.min\(4,\s*Number\(process\.env\.EXTERNAL_FETCH_CONCURRENCY/);
    // Must not keep the old default 6 / max 10 fan-out.
    expect(src).not.toMatch(/EXTERNAL_FETCH_CONCURRENCY \?\? 6/);
    expect(src).not.toMatch(/Math\.min\(10,\s*Number\(process\.env\.EXTERNAL_FETCH_CONCURRENCY/);
  });
});

describe('residual #68 recommend cold heavy gate', () => {
  it('ContentService wraps computeRecommendations under heavy gate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'content.service.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toMatch(
      /createRecommendationRuntime\(\(q\)\s*=>\s*\n?\s*withHeavyAggregateGate\(\(\)\s*=>\s*this\.delegates\.computeRecommendations\(q\)\)/
    );
    expect(src).toMatch(/HeavyAggregateQueueFullError/);
    expect(src).toMatch(/推荐计算繁忙/);
  });
});

describe('residual #68 dashboard summary COUNT pool', () => {
  it('computeDashboardSummary pools package loads via mapPool (residual #125 collapsed platform COUNTs)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard-performance-read.ts'),
      'utf8'
    );
    // Residual #125: platform counters no longer use countJobs/mapPool;
    // mapPool still gates multi-chunk package CopyPerformance loads.
    expect(src).toContain('mapPool');
    expect(src).toContain('QUERY_IN_CHUNKS_CONCURRENCY');
    expect(src).not.toMatch(/mapPool\(\s*countJobs,\s*QUERY_IN_CHUNKS_CONCURRENCY/);
    // Must not bare Promise.all five GeneratedCopy COUNTs.
    expect(src).not.toMatch(/Promise\.all\(\[\s*this\.prisma\.generatedCopy\.count/);
    expect(QUERY_IN_CHUNKS_CONCURRENCY).toBe(2);
  });
});
