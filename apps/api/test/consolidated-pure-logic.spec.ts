import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/common/ttl-cache';
import { resolveWithCacheFallback } from '../src/refund/refund-load';
import {
  bucketExprFor,
  csvCell,
  resolveWindow,
  sortColumn,
  whereArgsForWindow,
  whereClauseForWindow
} from '../src/merchant-sales/merchant-sales-window';
import {
  mapRankingRow,
  mapSummaryAggregate,
  buildMerchantSalesCsv
} from '../src/merchant-sales/merchant-sales-query';
import {
  mapDailyMetricsToKpi,
  mapDailyMetricsTrend,
  mapDistributionRows,
  pageMerchants,
  sortAndPageMerchants,
  sortMerchants
} from '../src/gmv/gmv-metrics';
import { resolveGmvKpis } from '../src/gmv/gmv-resolve';
import {
  bucketFromDays,
  groupCandidatesByMerchant,
  staleDaysFromBucket
} from '../src/zero-sales/zero-sales-candidates';
import {
  buildZeroSalesMerchantRows,
  mapZeroSalesSkuRows,
  paginateZeroSalesMerchants,
  zeroSalesMerchantsCacheKey
} from '../src/zero-sales/zero-sales-list';
import { buildZeroSalesSkuFilters } from '../src/zero-sales/zero-sales-loaders';
import { DEFAULT_INVENTORY_RULES } from '../src/domain/rules-defaults';
import {
  merchantListCacheKey,
  sortMerchantItems,
  paginateMerchantItems
} from '../src/merchant/merchant-list';
import { emptyMerchantProfile } from '../src/merchant/merchant-profile';
import { staleBucketFromDays as merchantStaleBucketFromDays } from '../src/merchant/merchant-sku';
import {
  daysSince,
  staleBucketFromDays,
  staleDaysFromBucket as movementStaleDaysFromBucket
} from '../src/movement/movement-stale';
import { buildStagnantCsv, csvEscape } from '../src/movement/movement-csv';
import { movingSkusCacheKey, stagnantSkusCacheKey } from '../src/movement/movement-list';
import { paginateMovementSkuRows } from '../src/movement/movement-skus';
import { buildOverviewKpiPayload } from '../src/overview/overview-kpis';
import { alertAggregateCacheKey, extractRankedAlerts } from '../src/content/alert.service';
import { prefilterPackagesForRecommend } from '../src/content/content-facade';

describe('refund resolveWithCacheFallback', () => {
  it('returns cached value without calling loaders', async () => {
    const cache = new TtlCache(60_000);
    cache.set('k', { hit: true });
    const primary = vi.fn(async () => ({ hit: false }));

    const result = await resolveWithCacheFallback({
      cache,
      cacheKey: 'k',
      primary
    });

    expect(result).toEqual({ hit: true });
    expect(primary).not.toHaveBeenCalled();
  });

  it('prefers primary when accepted and caches it', async () => {
    const cache = new TtlCache(60_000);
    const primary = vi.fn(async () => ({ source: 'primary', paidOrderCount: 1 }));
    const secondary = vi.fn(async () => ({ source: 'secondary', paidOrderCount: 2 }));

    const result = await resolveWithCacheFallback({
      cache,
      cacheKey: 'refund',
      primary,
      acceptPrimary: (v) => v.paidOrderCount > 0,
      secondary
    });

    expect(result.source).toBe('primary');
    expect(secondary).not.toHaveBeenCalled();
    expect(cache.get('refund')).toEqual(result);
  });

  it('returns rejected primary when secondary is null (no SalesSnapshot fallback)', async () => {
    const cache = new TtlCache(60_000);
    const primary = vi.fn(async () => ({ source: 'primary', paidOrderCount: 0 }));
    const secondary = vi.fn(async () => null);

    const result = await resolveWithCacheFallback({
      cache,
      cacheKey: 'refund2',
      primary,
      acceptPrimary: (v) => v.paidOrderCount > 0,
      secondary
    });

    expect(result.source).toBe('primary');
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(cache.get('refund2')).toEqual(result);
  });

  it('uses secondary when primary rejected and secondary accepted', async () => {
    const cache = new TtlCache(60_000);
    const result = await resolveWithCacheFallback({
      cache,
      cacheKey: 'refund3',
      primary: async () => ({ source: 'primary', paidOrderCount: 0 }),
      acceptPrimary: (v) => v.paidOrderCount > 0,
      secondary: async () => ({ source: 'secondary', paidOrderCount: 0 }),
      acceptSecondary: () => true
    });
    expect(result.source).toBe('secondary');
  });
});

describe('merchant-sales window and mappers', () => {
  it('maps sort/window SQL fragments', () => {
    expect(sortColumn('gmvDesc')).toContain('paidAmountOnline');
    expect(sortColumn('refundDesc')).toBe('"refundAmount"');
    expect(sortColumn('verifyDesc')).toBe('"verifyAmount"');
    expect(sortColumn('orderCountDesc')).toBe('"orderCount"');

    expect(whereClauseForWindow('day')).toContain('"date" >= ?');
    // year uses the same inclusive date bounds (trailing 90d), not substr year-key.
    expect(whereClauseForWindow('year')).toContain('"date" >= ?');
    expect(whereArgsForWindow('day', '2026-07-01', '2026-07-10')).toEqual([
      '2026-07-01',
      '2026-07-10'
    ]);
    expect(whereArgsForWindow('year', '2026-04-20', '2026-07-18')).toEqual([
      '2026-04-20',
      '2026-07-18'
    ]);
    expect(bucketExprFor('week')).toContain('%Y-W%W');
    expect(bucketExprFor('month')).toContain('substr("date", 1, 7)');
    expect(bucketExprFor('year')).toContain('substr("date", 1, 4)');
    expect(bucketExprFor('day')).toBe('"date"');
  });

  it('resolves day window to same start/end', () => {
    expect(resolveWindow('day', '2026-07-18')).toEqual({
      start: '2026-07-18',
      end: '2026-07-18'
    });
  });

  it('resolves year to trailing 90d (not full calendar year)', () => {
    expect(resolveWindow('year', '2026-07-18')).toEqual({
      start: '2026-04-20',
      end: '2026-07-18'
    });
  });

  it('caps multi-year custom week/month windows', () => {
    expect(() => resolveWindow('month', '2020-01-01', '2026-07-22')).toThrow();
    expect(resolveWindow('week', '2026-07-01', '2026-07-07')).toEqual({
      start: '2026-07-01',
      end: '2026-07-07'
    });
  });

  it('escapes csv cells and maps summary/ranking', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    // Excel/Sheets formula injection: leading = + - @ must be neutralized.
    expect(csvCell('=cmd|"/c calc"!A0')).toBe(`"'=cmd|""/c calc""!A0"`);
    expect(csvCell('+2+3')).toBe(`'+2+3`);
    expect(csvCell('-2+3')).toBe(`'-2+3`);
    expect(csvCell('@SUM(A1)')).toBe(`'@SUM(A1)`);

    const summary = mapSummaryAggregate(
      {
        totalGmv: 100,
        totalRefund: 10,
        totalVerify: 20,
        paidOrderCount: 5,
        merchantCount: 2,
        packageCount: 3
      },
      'day',
      '2026-07-01',
      '2026-07-01'
    );
    expect(summary.refundRate).toBeCloseTo(0.1);
    expect(summary.verifyRate).toBeCloseTo(0.2);
    expect(summary.dataSource).toBe('MerchantDailyMetrics');

    const emptySummary = mapSummaryAggregate(undefined, 'day', '2026-07-01', '2026-07-01');
    expect(emptySummary.dataSource).toBe('empty');
    expect(emptySummary.refundRate).toBe(0);

    const ranking = mapRankingRow({
      merchantName: 'M1',
      areaName: 'A',
      gmv: 200,
      gmvRefund: 20,
      gmvVerify: 40,
      paidOrderCount: 4,
      orderCount: 5,
      packageCount: 6
    });
    expect(ranking.refundRate).toBeCloseTo(0.1);
    expect(ranking.verifyRate).toBeCloseTo(0.2);

    const csv = buildMerchantSalesCsv(
      [
        {
          merchantName: 'A,B',
          areaName: null,
          gmv: 1,
          gmvRefund: 0,
          gmvVerify: 0,
          paidOrderCount: 1,
          orderCount: 1,
          packageCount: 1
        }
      ],
      'day',
      '2026-07-01',
      '2026-07-01'
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"A,B"');
  });
});

describe('gmv metrics and resolve priority', () => {
  it('maps daily metrics KPI with compare deltas', () => {
    const payload = mapDailyMetricsToKpi(
      {
        date: '2026-07-18',
        totalGmv: 200,
        gmvOnline: 150,
        gmvWallet: 50,
        gmvBonus: 0,
        gmvCard: 0,
        totalRefund: 20,
        refundRate: 0.1,
        totalVerify: 40,
        verifyRate: 0.2,
        paidOrderCount: 4,
        paidAmountBonus: 0,
        paidAmountWallet: 50,
        updatedAt: new Date('2026-07-18T00:00:00Z')
      },
      {
        monthGmv: 500,
        monthGmvOnline: 300,
        monthGmvWallet: 200,
        prev: {
          date: '2026-07-17',
          totalGmv: 100,
          gmvOnline: 80,
          gmvWallet: 20,
          gmvBonus: 0,
          gmvCard: 0,
          totalRefund: 5,
          refundRate: 0.05,
          totalVerify: 10,
          verifyRate: 0.1,
          paidOrderCount: 2,
          paidAmountBonus: 0,
          paidAmountWallet: 20,
          updatedAt: new Date('2026-07-17T00:00:00Z')
        }
      }
    );

    expect(payload.dataSource).toBe('DailyMetrics');
    expect(payload.avgOrderValue).toBe(50);
    expect(payload.compare?.totalGmv).toBe(1);
    expect(payload.compare?.paidOrderCount).toBe(1);
  });

  it('fills missing trend days and distribution other bucket', () => {
    const trend = mapDailyMetricsTrend(
      [
        {
          date: '2026-07-01',
          totalGmv: 10,
          gmvOnline: 8,
          gmvWallet: 2,
          gmvBonus: 0,
          totalRefund: 1,
          refundRate: 0.1,
          verifyRate: 0.2,
          paidOrderCount: 1
        }
      ],
      '2026-07-01',
      3
    );
    expect(trend).toHaveLength(3);
    expect(trend[0].totalGmv).toBe(10);
    expect(trend[1].totalGmv).toBe(0);
    expect(trend[2].date).toBe('2026-07-03');

    const dist = mapDistributionRows(
      [{ key: 'A', gmv: 80, gmvOnline: 80, gmvWallet: 0, gmvBonus: 0 }],
      100,
      1
    );
    // Residual #289: payload { items, limit, matched, truncated }
    expect(dist.items).toHaveLength(2);
    expect(dist.items[0].share).toBeCloseTo(0.8);
    expect(dist.items[1].totalGmv).toBe(20);
    expect(dist.items[1].key).toBe('其他');
    expect(dist.truncated).toBe(true);
    expect(dist.limit).toBe(1);
    expect(dist.matched).toBeGreaterThanOrEqual(2);
  });

  it('sorts and pages merchants', () => {
    const page = sortAndPageMerchants(
      [
        { merchantName: 'B', gmv: 10, gmvRefund: 5, gmvVerify: 1 } as any,
        { merchantName: 'A', gmv: 20, gmvRefund: 1, gmvVerify: 9 } as any,
        { merchantName: 'C', gmv: 15, gmvRefund: 8, gmvVerify: 2 } as any
      ],
      'gmvDesc',
      1,
      2
    );
    expect(page.items.map((x) => x.merchantName)).toEqual(['A', 'C']);
    expect(page.hasMore).toBe(true);

    // Aggregate sort once, page flips slice only — same pattern as list caches.
    const sorted = sortMerchants(
      [
        { merchantName: 'B', gmv: 10, gmvRefund: 5, gmvVerify: 1 } as any,
        { merchantName: 'A', gmv: 20, gmvRefund: 1, gmvVerify: 9 } as any,
        { merchantName: 'C', gmv: 15, gmvRefund: 8, gmvVerify: 2 } as any
      ],
      'gmvDesc'
    );
    const p2 = pageMerchants(sorted, 2, 2);
    expect(p2.items.map((x) => x.merchantName)).toEqual(['B']);
    expect(p2.hasMore).toBe(false);
  });

  it('uses OrderHeader for Beijing today without consulting DailyMetrics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T08:00:00Z'));
    const prisma = {
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (/refundTime/i.test(sql)) return [{ totalRefund: 0 }];
        return [
          {
            paidAmount: 100,
            paidAmountWallet: 20,
            paidAmountBonus: 0,
            paidAmountCard: 0,
            verifyAmount: 0,
            orderCount: 2
          }
        ];
      }),
      contentPackage: {},
      dailyMetrics: {
        findUnique: vi.fn(),
        findMany: vi.fn()
      },
      orderHeader: {}
    } as any;

    try {
      const payload = await resolveGmvKpis(prisma, '2026-07-18');
      expect(payload.dataSource).toBe('OrderHeader');
      expect(payload.totalGmv).toBe(120);
      expect(payload.paidOrderCount).toBe(2);
      expect(prisma.dailyMetrics.findUnique).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to DailyMetrics when OrderHeader is empty on a history day', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (/refundTime/i.test(sql)) return [{ totalRefund: 0 }];
        return [
          {
            paidAmount: 0,
            paidAmountWallet: 0,
            paidAmountBonus: 0,
            paidAmountCard: 0,
            verifyAmount: 0,
            orderCount: 0
          }
        ];
      }),
      salesSnapshot: {},
      contentPackage: {},
      dailyMetrics: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.date === '2026-07-18') {
            return {
              date: '2026-07-18',
              totalGmv: 50,
              gmvOnline: 40,
              gmvWallet: 10,
              gmvBonus: 0,
              gmvCard: 0,
              totalRefund: 5,
              refundRate: 0.1,
              totalVerify: 8,
              verifyRate: 0.16,
              paidOrderCount: 1,
              paidAmountBonus: 0,
              paidAmountWallet: 10,
              updatedAt: new Date('2026-07-18T00:00:00Z')
            };
          }
          return null;
        }),
        findMany: vi.fn(async () => [{ totalGmv: 50, gmvOnline: 40, gmvWallet: 10 }])
      },
      orderHeader: {}
    } as any;

    const payload = await resolveGmvKpis(prisma, '2026-07-18');
    expect(payload.dataSource).toBe('DailyMetrics');
    expect(payload.totalGmv).toBe(50);
  });

  it('keeps OrderHeader zeros when DailyMetrics missing (never SalesSnapshot)', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (/OrderHeader/i.test(sql) && /refundTime/i.test(sql)) return [{ totalRefund: 0 }];
        if (/OrderHeader/i.test(sql)) {
          return [
            {
              paidAmount: 0,
              paidAmountWallet: 0,
              paidAmountBonus: 0,
              paidAmountCard: 0,
              verifyAmount: 0,
              orderCount: 0
            }
          ];
        }
        return [];
      }),
      contentPackage: {},
      dailyMetrics: {
        findUnique: vi.fn(async () => null),
        findMany: vi.fn(async () => [])
      },
      orderHeader: {}
    } as any;

    const payload = await resolveGmvKpis(prisma, '2026-06-01');
    expect(payload.dataSource).toBe('OrderHeader');
    expect(payload.totalGmv).toBe(0);
    expect(payload.paidOrderCount).toBe(0);
  });
});

describe('zero-sales bucket and list mapping', () => {
  const rules = DEFAULT_INVENTORY_RULES;

  it('maps bucket thresholds both ways', () => {
    expect(staleDaysFromBucket('stale_60d', rules)).toBe(60);
    expect(staleDaysFromBucket('stale_30d', rules)).toBe(30);
    expect(staleDaysFromBucket('stale_15d', rules)).toBe(15);
    expect(staleDaysFromBucket('stale_7d', rules)).toBe(7);
    expect(staleDaysFromBucket('normal', rules)).toBe(0);

    expect(bucketFromDays(0, rules)).toBe('normal');
    expect(bucketFromDays(7, rules)).toBe('stale_7d');
    expect(bucketFromDays(15, rules)).toBe('stale_15d');
    expect(bucketFromDays(30, rules)).toBe('stale_30d');
    expect(bucketFromDays(60, rules)).toBe('stale_60d');
  });

  it('builds multi-area / multi-merchant zero-sales filters', () => {
    const multi = buildZeroSalesSkuFilters({
      areaIds: ['A1', 'A2'],
      merchantIds: ['M1', 'M2'],
      threshold: '2026-01-01'
    });
    expect(multi.filters.some((f) => f.includes('IN (?,?)'))).toBe(true);
    expect(multi.params).toEqual(['M1', 'M2', 'A1', 'A2', '2026-01-01']);

    const single = buildZeroSalesSkuFilters({
      areaId: 'A1',
      merchantId: 'M1',
      threshold: '2026-01-01'
    });
    expect(single.filters).toContain('cp."areaId" = ?');
    expect(single.filters).toContain('cp."merchantId" = ?');
    expect(single.params).toEqual(['M1', 'A1', '2026-01-01']);
  });

  it('groups candidates and builds merchant rows', () => {
    const byMerchant = groupCandidatesByMerchant([
      {
        packageId: 'p1',
        merchantId: 'm1',
        merchantName: 'M1',
        areaName: 'A',
        areaId: 'a1'
      },
      {
        packageId: 'p2',
        merchantId: 'm1',
        merchantName: 'M1',
        areaName: 'A',
        areaId: 'a1'
      },
      {
        packageId: 'p3',
        merchantId: 'm2',
        merchantName: 'M2',
        areaName: 'B',
        areaId: 'b1'
      }
    ]);
    expect(byMerchant.get('m1')?.packageIds).toEqual(['p1', 'p2']);

    const rows = buildZeroSalesMerchantRows({
      byMerchant,
      gmvByPackage: new Map([
        ['p1', 10],
        ['p2', 5],
        ['p3', 100]
      ]),
      lastSalesByPackage: new Map([
        ['p1', '2026-06-01'],
        ['p2', '2026-06-10'],
        ['p3', '2026-05-01']
      ]),
      totalSkuByMerchant: new Map([
        ['m1', 8],
        ['m2', 3]
      ]),
      today: '2026-07-18'
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].merchantId).toBe('m1');
    expect(rows[0].staleSkuCount).toBe(2);
    expect(rows[0].staleGmv30d).toBe(15);
    expect(rows[0].lastSalesDate).toBe('2026-06-10');
  });

  it('maps sku rows with default days and bucket', () => {
    const items = mapZeroSalesSkuRows(
      [
        {
          packageId: 'p1',
          packageName: 'P1',
          merchantId: 'm1',
          merchantName: 'M1',
          areaName: 'A',
          category: 'C',
          salePrice: 12.5,
          stockLeft: 3,
          stockTotal: 10,
          lastSalesDate: null,
          daysSinceLastSale: null,
          staleGmv30d: 1,
          staleSalesQty30d: 2
        }
      ],
      rules
    );
    expect(items[0].daysSinceLastSale).toBe(9999);
    expect(items[0].staleBucket).toBe('stale_60d');
    expect(items[0].salePrice).toBe(12.5);
  });
});

describe('merchant list/profile helpers', () => {
  it('sorts and paginates merchant items', () => {
    const items = [
      {
        merchantId: 'm2',
        merchantName: 'B',
        areaId: null,
        areaName: null,
        totalSku: 5,
        stale30SkuCount: 1,
        stale30Ratio: 0.2,
        totalGmv30d: 300
      },
      {
        merchantId: 'm1',
        merchantName: 'A',
        areaId: null,
        areaName: null,
        totalSku: 10,
        stale30SkuCount: 4,
        stale30Ratio: 0.4,
        totalGmv30d: 100
      }
    ];

    sortMerchantItems(items, 'stale30Desc');
    expect(items[0].merchantId).toBe('m1');

    sortMerchantItems(items, 'totalGmvDesc');
    expect(items[0].merchantId).toBe('m2');

    sortMerchantItems(items, 'totalSkuDesc');
    expect(items[0].merchantId).toBe('m1');

    const page = paginateMerchantItems(items, { page: 1, pageSize: 1 } as any);
    expect(page.items).toHaveLength(1);
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.total).toBe(2);
  });

  it('builds merchant list cache keys without page so flips share one aggregate', () => {
    const base = {
      query: { areaId: 'a1', search: 'foo', sort: 'stale30Desc' as const },
      scope: { areaIds: ['z', 'a'], merchantIds: ['m2', 'm1'] },
      today: '2026-07-23'
    };
    const k1 = merchantListCacheKey(base);
    const k2 = merchantListCacheKey({
      ...base,
      scope: { areaIds: ['a', 'z'], merchantIds: ['m1', 'm2'] }
    });
    expect(k1).toBe(k2);
    expect(k1).toContain('merchants:list');
    expect(k1).not.toMatch(/\|1\|20$/);
  });

  it('paginates zero-sales merchants from a full aggregate cache payload', () => {
    const rows = [
      {
        merchantId: 'm1',
        merchantName: 'M1',
        areaName: 'A',
        areaId: 'a',
        totalSku: 3,
        staleSkuCount: 2,
        staleGmv30d: 10,
        lastSalesDate: null
      },
      {
        merchantId: 'm2',
        merchantName: 'M2',
        areaName: 'B',
        areaId: 'b',
        totalSku: 1,
        staleSkuCount: 1,
        staleGmv30d: 0,
        lastSalesDate: null
      }
    ];
    const p1 = paginateZeroSalesMerchants(rows, 1, 1);
    const p2 = paginateZeroSalesMerchants(rows, 2, 1);
    expect(p1.items[0].merchantId).toBe('m1');
    expect(p2.items[0].merchantId).toBe('m2');
    expect(p1.pagination.total).toBe(2);
    expect(p2.pagination.hasMore).toBe(false);

    const keyA = zeroSalesMerchantsCacheKey(
      { staleBucket: 'stale_30d', areaIds: ['b', 'a'], page: 1, pageSize: 20 } as any,
      '2026-07-23'
    );
    const keyB = zeroSalesMerchantsCacheKey(
      { staleBucket: 'stale_30d', areaIds: ['a', 'b'], page: 9, pageSize: 5 } as any,
      '2026-07-23'
    );
    // page/pageSize must not affect the aggregate key
    expect(keyA).toBe(keyB);
  });

  it('builds empty profile and merchant sku buckets', () => {
    expect(emptyMerchantProfile('m9')).toMatchObject({
      merchantId: 'm9',
      totalSku: 0,
      stale30SkuCount: 0
    });
    expect(merchantStaleBucketFromDays(0)).toBe('normal');
    expect(merchantStaleBucketFromDays(7)).toBe('stale_7d');
    expect(merchantStaleBucketFromDays(60)).toBe('stale_60d');
  });
});

describe('movement stale + csv', () => {
  it('builds moving/stagnant aggregate cache keys without page', () => {
    const today = '2026-07-23';
    const movingA = movingSkusCacheKey(
      { days: 7, areaIds: ['b', 'a'], merchantIds: ['m2', 'm1'], search: 'x' },
      today
    );
    const movingB = movingSkusCacheKey(
      { days: 7, areaIds: ['a', 'b'], merchantIds: ['m1', 'm2'], search: 'x' },
      today
    );
    expect(movingA).toBe(movingB);
    expect(movingA).toContain('movement:moving');

    const stagnantA = stagnantSkusCacheKey(
      {
        bucket: 'stale_30d',
        sort: 'gmvDesc',
        areaIds: ['b', 'a'],
        page: 1,
        pageSize: 20
      } as any,
      today
    );
    const stagnantB = stagnantSkusCacheKey(
      {
        bucket: 'stale_30d',
        sort: 'gmvDesc',
        areaIds: ['a', 'b'],
        page: 9,
        pageSize: 5
      } as any,
      today
    );
    expect(stagnantA).toBe(stagnantB);
    expect(stagnantA).toContain('movement:stagnant');

    const page1 = paginateMovementSkuRows(
      [{ packageId: 'p1' } as any, { packageId: 'p2' } as any, { packageId: 'p3' } as any],
      2,
      1
    );
    expect(page1.items[0].packageId).toBe('p2');
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);
  });

  it('builds alert aggregate cache keys without page/filter and scopes multi-tenant', () => {
    const today = '2026-07-23';
    const keyA = alertAggregateCacheKey(
      { role: 'area_operator', date: '2026-07-20' },
      { areaIds: ['b', 'a'], merchantIds: ['m2', 'm1'] },
      today
    );
    const keyB = alertAggregateCacheKey(
      { role: 'area_operator', date: '2026-07-20' },
      { areaIds: ['a', 'b'], merchantIds: ['m1', 'm2'] },
      today
    );
    expect(keyA).toBe(keyB);
    expect(keyA).toContain('alerts:aggregate');
    expect(keyA).toContain('2026-07-20');

    const otherScope = alertAggregateCacheKey(
      { role: 'area_operator', date: '2026-07-20' },
      { areaIds: ['c'] },
      today
    );
    expect(otherScope).not.toBe(keyA);

    const ranked = extractRankedAlerts(
      [
        {
          operationAlerts: [
            { alertId: 'A1', level: 'info' } as any,
            { alertId: 'A2', level: 'danger' } as any
          ]
        }
      ],
      (alerts) =>
        [...alerts].sort((a, b) => (a.level === 'danger' ? -1 : b.level === 'danger' ? 1 : 0))
    );
    expect(ranked.map((a) => a.alertId)).toEqual(['A2', 'A1']);
  });

  it('prefilters recommend packages before inventory scoring', () => {
    const pkgs = [
      { packageId: 'p1', category: 'food', saleStatus: 'selling', stockLeft: 10 },
      { packageId: 'p2', category: 'food', saleStatus: 'recycle', stockLeft: 10 },
      { packageId: 'p3', category: 'spa', saleStatus: 'selling', stockLeft: 2 },
      { packageId: 'p4', category: 'food', saleStatus: 'selling', stockLeft: 0 }
    ] as any[];
    const filtered = prefilterPackagesForRecommend(pkgs, {
      category: 'food',
      inventoryMin: 1,
      status: 'selling'
    });
    expect(filtered.map((p) => p.packageId)).toEqual(['p1']);
  });

  it('computes daysSince and stale buckets', () => {
    expect(daysSince('2026-07-18', null)).toBe(9999);
    expect(daysSince('2026-07-18', '2026-07-11')).toBe(7);
    expect(staleBucketFromDays(6)).toBe('normal');
    expect(staleBucketFromDays(7)).toBe('stale_7d');
    expect(staleBucketFromDays(15)).toBe('stale_15d');
    expect(staleBucketFromDays(30)).toBe('stale_30d');
    expect(staleBucketFromDays(60)).toBe('stale_60d');
    expect(movementStaleDaysFromBucket('normal')).toBe(7);
    expect(movementStaleDaysFromBucket('stale_30d')).toBe(30);
  });

  it('builds stagnant csv with BOM and escaping', () => {
    const csv = buildStagnantCsv([
      {
        packageId: 'p1',
        packageName: '名,称',
        merchantName: '商家"A"',
        areaName: null,
        category: 'C',
        salePrice: 1,
        stockLeft: 2,
        stockTotal: 3,
        lastSalesDate: null,
        daysSinceLastSale: 40,
        staleBucket: 'stale_30d',
        recent30dSalesQty: 0,
        recent30dSalesAmount: 0
      },
      {
        // Formula-like packageId must be neutralized in CSV export.
        packageId: "=cmd|'/c calc'!A1",
        packageName: 'x',
        merchantName: 'm',
        areaName: 'a',
        category: 'c',
        salePrice: 1,
        stockLeft: 0,
        stockTotal: 0,
        lastSalesDate: null,
        daysSinceLastSale: 99,
        staleBucket: 'stale_90d',
        recent30dSalesQty: 0,
        recent30dSalesAmount: 0
      }
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('=1+1')).toBe(`'=1+1`);
    expect(csvEscape('+HYPERLINK("http://x")')).toBe(`"'+HYPERLINK(""http://x"")"`);
    expect(csvEscape('\t=1+1')).toBe(`'\t=1+1`);
    expect(csv).toContain('"名,称"');
    expect(csv).toContain('"商家""A"""');
    expect(csv).toContain(csvEscape(`=cmd|'/c calc'!A1`));
    expect(csv).not.toMatch(/(?:^|,)=cmd/m);
  });
});

describe('content category multi-scope filter', () => {
  it('filters categories by multi area/merchant ids', async () => {
    const { collectPackageCategories } = await import('../src/content/content-facade');
    const packages = [
      { packageId: 'p1', areaId: 'A1', merchantId: 'M1', category: '餐饮', saleStatus: 'selling' },
      { packageId: 'p2', areaId: 'A2', merchantId: 'M2', category: '丽人', saleStatus: 'selling' },
      { packageId: 'p3', areaId: 'A3', merchantId: 'M3', category: '休闲', saleStatus: 'selling' },
      { packageId: 'p4', areaId: 'A1', merchantId: 'M9', category: '亲子', saleStatus: 'offline' }
    ] as any[];

    const multiArea = collectPackageCategories(packages, { areaIds: ['A1', 'A2'] });
    expect(multiArea.categories).toEqual(['丽人', '亲子', '餐饮']);

    const multiMerchant = collectPackageCategories(packages, { merchantIds: ['M2', 'M3'] });
    expect(multiMerchant.categories).toEqual(['丽人', '休闲']);

    const merchantOp = collectPackageCategories(packages, {
      areaIds: ['A1', 'A2'],
      role: 'merchant_operator'
    });
    expect(merchantOp.categories).toEqual(['丽人', '餐饮']);
  });
});

describe('overview pure helpers', () => {
  it('builds KPI payload and zero ratio safely', () => {
    const payload = buildOverviewKpiPayload({
      today: '2026-07-18',
      totalMerchants: 10,
      totalSkus: 50,
      todayGmv: 100,
      todayOrderCount: 4,
      staleSkuRows: { stale30SkuCount: 5, distinctMerchants: 2 },
      moneyDataSource: 'OrderHeader'
    });
    expect(payload.zeroSalesSkuRatio).toBeCloseTo(0.1);
    expect(payload.zeroSalesMerchants).toBe(2);
    expect(payload.dataSource).toBe('OrderHeader');

    const empty = buildOverviewKpiPayload({
      today: '2026-07-18',
      totalMerchants: 0,
      totalSkus: 0,
      todayGmv: 0,
      todayOrderCount: 0,
      staleSkuRows: { stale30SkuCount: 0, distinctMerchants: 0 },
      moneyDataSource: 'OrderHeader'
    });
    expect(empty.zeroSalesSkuRatio).toBe(0);
  });
});
