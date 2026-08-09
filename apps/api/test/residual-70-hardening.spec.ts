import { describe, expect, it } from 'vitest';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../src/common/heavy-aggregate-gate';
import { GMV_TOP_MERCHANTS_LIMIT } from '../src/common/sql-chunk';

describe('residual #70 GMV heavy gate', () => {
  it('createGmvCacheMethods wraps cold loaders in withHeavyAggregateGate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv.service.ts'),
      'utf8'
    );
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toContain('gmvHeavyLoad');
    expect(src).toMatch(/HeavyAggregateQueueFullError/);
    expect(src).toMatch(/GMV 计算繁忙/);
    // force still goes through getOrLoad → gmvHeavyLoad (not bypass).
    expect(src).toMatch(/getOrLoad\(`gmvToday:[\s\S]{0,120}gmvHeavyLoad/);
    expect(src).toMatch(/getOrLoad\(`gmvTrend:[\s\S]{0,120}gmvHeavyLoad/);
  });
});

describe('residual #70 dashboard ops heavy gate', () => {
  it('ops/today + performance + summary cold paths use heavy gate', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const [opsSrc, summarySrc] = await Promise.all([
      fs.readFile(
        path.join(__dirname, '..', 'src', 'content', 'dashboard-operations.service.ts'),
        'utf8'
      ),
      fs.readFile(
        path.join(__dirname, '..', 'src', 'content', 'dashboard-summary.service.ts'),
        'utf8'
      )
    ]);
    const src = `${opsSrc}\n${summarySrc}`;
    expect(src).toContain('withHeavyAggregateGate');
    expect(src).toMatch(
      /getOrLoad\(cacheKey, false, \(\) =>\s*withHeavyAggregateGate\(\(\) =>\s*this\.computeTodayOperationConsole/
    );
    expect(src).toMatch(
      /getOrLoad\(cacheKey, false, \(\) =>\s*withHeavyAggregateGate\(\(\) => this\.computePerformance/
    );
    expect(src).toMatch(
      /getOrLoad\(key, false, \(\) =>\s*withHeavyAggregateGate\(\(\) => this\.computeDashboardSummary/
    );
    expect(src).toMatch(/运营台计算繁忙|效果数据计算繁忙|Dashboard 摘要计算繁忙/);
  });
});

describe('residual #70 merchant-sales ranking page-less cache', () => {
  it('caches full ranking aggregate without page in key', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const load = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-load.ts'),
      'utf8'
    );
    const query = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-ranking-query.ts'),
      'utf8'
    );
    const dto = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales.dto.ts'),
      'utf8'
    );
    expect(load).toContain('withHeavyAggregateGate');
    expect(load).toContain('queryAllRankingRows');
    expect(load).toContain('paginateRankingRows');
    // ranking key must not include page/pageSize.
    expect(load).toMatch(
      /ranking:\s*\(\s*window[\s\S]*?sortBy[\s\S]*?\)\s*=>\s*`ranking:\$\{window\}:\$\{start\}:\$\{end\}:\$\{sortBy\}`/
    );
    expect(load).not.toMatch(/:\$\{page\}:\$\{pageSize\}/);
    expect(query).toContain('queryAllRankingRows');
    expect(query).toContain('GMV_TOP_MERCHANTS_LIMIT');
    expect(query).toMatch(/LIMIT \?/);
    // DTO deep-page clamp.
    expect(dto).toMatch(/@Max\(100\)\s*page/);
    expect(dto).toMatch(/@Max\(100\)\s*pageSize/);
    expect(GMV_TOP_MERCHANTS_LIMIT).toBe(1_000);
    expect(HEAVY_LIST_CACHE_MAX_SIZE).toBe(64);
  });
});
