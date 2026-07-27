import { describe, expect, it } from 'vitest';
import { CSV_EXPORT_MAX_ROWS, ZERO_SALES_SKUS_CACHE_CAP } from '../src/common/sql-chunk';
import { paginateZeroSalesSkus, zeroSalesSkusCacheKey } from '../src/zero-sales/zero-sales-list';
import type { ZeroSalesSkusQueryDto } from '../src/zero-sales/zero-sales.dto';

describe('residual #74 zero-sales SKU page-less head cache', () => {
  it('ZERO_SALES_SKUS_CACHE_CAP covers export head', () => {
    expect(ZERO_SALES_SKUS_CACHE_CAP).toBe(CSV_EXPORT_MAX_ROWS);
    expect(ZERO_SALES_SKUS_CACHE_CAP).toBeGreaterThanOrEqual(1000);
  });

  it('zeroSalesSkusCacheKey omits page/pageSize', () => {
    const base = {
      staleBucket: 'stale_7d',
      sort: 'lastSalesDateAsc',
      merchantId: 'm1',
      areaId: 'a1',
      category: 'food',
      search: 'x'
    } as ZeroSalesSkusQueryDto;
    const today = '2026-07-24';
    const k1 = zeroSalesSkusCacheKey({ ...base, page: 1, pageSize: 50 }, today);
    const k2 = zeroSalesSkusCacheKey({ ...base, page: 3, pageSize: 100 }, today);
    const kExport = zeroSalesSkusCacheKey(
      { ...base, page: 1, pageSize: CSV_EXPORT_MAX_ROWS },
      today
    );
    expect(k1).toBe(k2);
    expect(k1).toBe(kExport);
    expect(k1).toMatch(/^zero-sales:skus\|/);
    expect(k1).toContain(today);
    expect(k1).not.toMatch(/\|1\|50$/);
    // Different filters must not collide.
    const kOther = zeroSalesSkusCacheKey(
      { ...base, merchantId: 'm2', page: 1, pageSize: 50 },
      today
    );
    expect(k1).not.toBe(kOther);
  });

  it('paginateZeroSalesSkus slices head and reports hasMore/total', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      packageId: `p${i}`,
      packageName: `pkg${i}`,
      merchantId: 'm',
      merchantName: 'M',
      areaName: 'A',
      category: 'c',
      salePrice: 1,
      stockLeft: 1,
      stockTotal: 10,
      lastSalesDate: null as string | null,
      daysSinceLastSale: 9999,
      staleBucket: 'stale_60d' as const,
      staleGmv30d: 0,
      staleSalesQty30d: 0
    }));
    const page1 = paginateZeroSalesSkus(rows, 1, 10);
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0].packageId).toBe('p0');
    expect(page1.pagination).toEqual({
      page: 1,
      pageSize: 10,
      hasMore: true,
      total: 25
    });
    const page3 = paginateZeroSalesSkus(rows, 3, 10);
    expect(page3.items).toHaveLength(5);
    expect(page3.items[0].packageId).toBe('p20');
    expect(page3.pagination.hasMore).toBe(false);
  });

  it('loaders + service wire page-less head (source contract)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const loaders = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-loaders.ts'),
      'utf8'
    );
    const list = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-list.ts'),
      'utf8'
    );
    const service = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales.service.ts'),
      'utf8'
    );
    const chunk = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'sql-chunk.ts'),
      'utf8'
    );
    expect(chunk).toContain('ZERO_SALES_SKUS_CACHE_CAP');
    expect(loaders).toContain('queryAllZeroSalesSkuRows');
    expect(loaders).toContain('loadZeroSalesSkuCandidates');
    expect(loaders).toMatch(/LIMIT \?/);
    expect(loaders).not.toMatch(/LIMIT \? OFFSET \?/);
    // residual #78: JS sort — no SQL ORDER BY lastSalesDate / staleGmv before LIMIT.
    expect(loaders).toContain('sortZeroSalesSkuRows');
    expect(loaders).not.toMatch(/ORDER BY \$\{orderBy\}/);
    expect(list).toContain('ZERO_SALES_SKUS_CACHE_CAP');
    expect(list).toContain('queryAllZeroSalesSkuRows');
    expect(list).toContain('paginateZeroSalesSkus');
    expect(list).toContain('computeZeroSalesSkus');
    expect(service).toMatch(/getOrLoad<ZeroSalesSkuItem\[\]>/);
    expect(service).toContain('computeZeroSalesSkus');
    expect(service).toContain('paginateZeroSalesSkus');
    // listSkus and export share page-less key + head.
    expect(service).toMatch(/listSkus[\s\S]*zeroSalesSkusCacheKey/);
    expect(service).toMatch(/listSkusForExport[\s\S]*zeroSalesSkusCacheKey/);
  });
});
