import { describe, expect, it } from 'vitest';
import { PLATFORM_SCAN_LIMIT, ZERO_SALES_SKUS_CACHE_CAP } from '../src/common/sql-chunk';
import {
  mapZeroSalesSkuCandidates,
  sortZeroSalesSkuRows,
  zeroSalesDaysSince,
  type ZeroSalesSkuCandidate
} from '../src/zero-sales/zero-sales-loaders';
import type { ZeroSalesSkuRow } from '../src/zero-sales/zero-sales.dto';

describe('residual #78 ZS SKU movement-style candidate path', () => {
  it('zeroSalesDaysSince treats null as 9999 and counts calendar days', () => {
    expect(zeroSalesDaysSince('2026-07-24', null)).toBe(9999);
    expect(zeroSalesDaysSince('2026-07-24', '2026-07-24')).toBe(0);
    expect(zeroSalesDaysSince('2026-07-24', '2026-07-17')).toBe(7);
    expect(zeroSalesDaysSince('2026-07-24', '2026-06-24')).toBe(30);
  });

  it('sortZeroSalesSkuRows: lastSalesDateAsc / staleDesc nulls-first then oldest', () => {
    const rows: ZeroSalesSkuRow[] = [
      {
        packageId: 'p-mid',
        packageName: 'm',
        merchantId: 'm',
        merchantName: 'M',
        areaName: 'A',
        category: 'c',
        salePrice: 1,
        stockLeft: 1,
        stockTotal: 10,
        lastSalesDate: '2026-07-10',
        daysSinceLastSale: 14,
        staleGmv30d: 50,
        staleSalesQty30d: 2
      },
      {
        packageId: 'p-null',
        packageName: 'n',
        merchantId: 'm',
        merchantName: 'M',
        areaName: 'A',
        category: 'c',
        salePrice: 1,
        stockLeft: 1,
        stockTotal: 10,
        lastSalesDate: null,
        daysSinceLastSale: 9999,
        staleGmv30d: 0,
        staleSalesQty30d: 0
      },
      {
        packageId: 'p-old',
        packageName: 'o',
        merchantId: 'm',
        merchantName: 'M',
        areaName: 'A',
        category: 'c',
        salePrice: 1,
        stockLeft: 1,
        stockTotal: 10,
        lastSalesDate: '2026-06-01',
        daysSinceLastSale: 53,
        staleGmv30d: 10,
        staleSalesQty30d: 1
      }
    ];
    sortZeroSalesSkuRows(rows, 'lastSalesDateAsc');
    expect(rows.map((r) => r.packageId)).toEqual(['p-null', 'p-old', 'p-mid']);
    // staleDesc shares the same daysSince ordering.
    sortZeroSalesSkuRows(rows, 'staleDesc');
    expect(rows.map((r) => r.packageId)).toEqual(['p-null', 'p-old', 'p-mid']);
  });

  it('sortZeroSalesSkuRows: gmvDesc ranks by staleGmv30d', () => {
    const rows: ZeroSalesSkuRow[] = [
      {
        packageId: 'p-low',
        packageName: 'l',
        merchantId: 'm',
        merchantName: 'M',
        areaName: 'A',
        category: 'c',
        salePrice: 1,
        stockLeft: 1,
        stockTotal: 10,
        lastSalesDate: null,
        daysSinceLastSale: 9999,
        staleGmv30d: 10,
        staleSalesQty30d: 1
      },
      {
        packageId: 'p-high',
        packageName: 'h',
        merchantId: 'm',
        merchantName: 'M',
        areaName: 'A',
        category: 'c',
        salePrice: 1,
        stockLeft: 1,
        stockTotal: 10,
        lastSalesDate: '2026-07-01',
        daysSinceLastSale: 23,
        staleGmv30d: 999,
        staleSalesQty30d: 5
      },
      {
        packageId: 'p-mid',
        packageName: 'm',
        merchantId: 'm',
        merchantName: 'M',
        areaName: 'A',
        category: 'c',
        salePrice: 1,
        stockLeft: 1,
        stockTotal: 10,
        lastSalesDate: '2026-07-05',
        daysSinceLastSale: 19,
        staleGmv30d: 100,
        staleSalesQty30d: 2
      }
    ];
    sortZeroSalesSkuRows(rows, 'gmvDesc');
    expect(rows.map((r) => r.packageId)).toEqual(['p-high', 'p-mid', 'p-low']);
  });

  it('mapZeroSalesSkuCandidates merges metrics + defaults missing to null/0', () => {
    const candidates: ZeroSalesSkuCandidate[] = [
      {
        packageId: 'p1',
        packageName: 'pkg1',
        merchantId: 'm1',
        merchantName: 'M1',
        areaName: 'A',
        category: 'food',
        salePriceFen: 1_250n,
        stockLeft: 3,
        stockTotal: 20
      },
      {
        packageId: 'p2',
        packageName: 'pkg2',
        merchantId: 'm1',
        merchantName: 'M1',
        areaName: 'A',
        category: 'food',
        salePriceFen: 800n,
        stockLeft: 1,
        stockTotal: 5
      }
    ];
    const metrics = new Map([
      [
        'p1',
        {
          lastSalesDate: '2026-07-10',
          staleGmv30d: 42,
          staleSalesQty30d: 3
        }
      ]
    ]);
    const rows = mapZeroSalesSkuCandidates(candidates, metrics, '2026-07-24');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      packageId: 'p1',
      lastSalesDate: '2026-07-10',
      daysSinceLastSale: 14,
      staleGmv30d: 42,
      staleSalesQty30d: 3
    });
    expect(rows[1]).toMatchObject({
      packageId: 'p2',
      lastSalesDate: null,
      daysSinceLastSale: 9999,
      staleGmv30d: 0,
      staleSalesQty30d: 0
    });
  });

  it('loaders use candidate + batch enrich, not correlated ORDER BY (source contract)', async () => {
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
    // Candidate path present.
    expect(loaders).toContain('loadZeroSalesSkuCandidates');
    expect(loaders).toContain('loadZeroSalesSkuMetricsByPackage');
    expect(loaders).toContain('sortZeroSalesSkuRows');
    expect(loaders).toContain('mapZeroSalesSkuCandidates');
    expect(loaders).toContain('queryInChunks');
    // Cheap ORDER BY packageId only on candidates (not metric columns).
    expect(loaders).toMatch(/ORDER BY cp\."packageId" ASC/);
    // No correlated last-sale / 30d subqueries in SELECT for ORDER BY.
    expect(loaders).not.toMatch(
      /SELECT MAX\(s\."date"\)\s+FROM "PackageSalesDaily" s\s+WHERE s\."packageId" = cp\."packageId"/
    );
    expect(loaders).not.toMatch(/ORDER BY \$\{orderBy\}/);
    // No live correlated-select SQL builder / SQL order-by helper (comment mentions of the old name ok).
    expect(loaders).not.toMatch(/export function buildZeroSalesSkuSelectSql/);
    expect(loaders).not.toMatch(/export function zeroSalesSkuOrderBy/);
    // CAP / PLATFORM_SCAN bounds.
    expect(loaders).toContain('ZERO_SALES_SKUS_CACHE_CAP');
    expect(loaders).toContain('PLATFORM_SCAN_LIMIT');
    expect(ZERO_SALES_SKUS_CACHE_CAP).toBeLessThanOrEqual(PLATFORM_SCAN_LIMIT);
    // compute path passes lastSaleFrom bound.
    expect(list).toMatch(/lastSaleFrom/);
    expect(list).toMatch(/stale60Days \+ 30/);
  });
});
