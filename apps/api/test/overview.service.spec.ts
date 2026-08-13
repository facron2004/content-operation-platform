import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewService } from '../src/overview/overview.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * OverviewService 单测：覆盖"返回结构稳定 + 缓存命中 + 阈值注入"三件事。
 * 不连真实 DB,改用最小 mock。Prisma aggregate 真实行为走集成验证。
 */

const buildPrisma = (
  overrides: Partial<{
    merchantCount: number;
    skuCount: number;
    todayGmv: number;
    todayOrderCount: number;
    sourceUpdatedAt: string | null;
    stale30SkuCount: number;
    distinctMerchants: number;
  }> = {}
) => {
  const defaults = {
    merchantCount: 100,
    skuCount: 500,
    todayGmv: 12345.67,
    todayOrderCount: 78,
    sourceUpdatedAt: '2026-07-13 07:30:00',
    stale30SkuCount: 42,
    distinctMerchants: 12
  };
  const v = { ...defaults, ...overrides };
  return {
    merchant: { count: vi.fn().mockResolvedValue(v.merchantCount) },
    contentPackage: { count: vi.fn().mockResolvedValue(v.skuCount) },
    dailyMetrics: {
      findUnique: vi.fn().mockResolvedValue(null)
    },
    $queryRawUnsafe: vi.fn().mockImplementation((sql: string) => {
      // Shared money-day: SUM(GMV) + COUNT(*) in one OrderHeader query
      if (/OrderHeader/i.test(sql) && /totalGmv/i.test(sql) && /paidOrderCount/i.test(sql)) {
        return [
          {
            totalGmv: Math.round(v.todayGmv * 100),
            totalGmvFen: Math.round(v.todayGmv * 100),
            paidOrderCount: v.todayOrderCount,
            sourceUpdatedAt: v.sourceUpdatedAt
          }
        ];
      }
      if (
        /OrderHeader/i.test(sql) &&
        /paidAmount\s*\+\s*"paidAmountWallet"|paidAmount" \+ "paidAmountWallet/i.test(sql)
      ) {
        return [{ totalGmv: v.todayGmv, gmv: v.todayGmv, paidOrderCount: v.todayOrderCount }];
      }
      // Shared stale-bucket histogram (loadPlatformStaleBucketStats).
      // KPI derives zeroSalesSkuCount = stale_30d + stale_60d.
      if (/julianday/i.test(sql) && /bucket/i.test(sql)) {
        // Put all stale-30-equivalent SKUs into stale_30d for a simple mock.
        return [
          { bucket: 'stale_30d', totalSku: v.stale30SkuCount },
          { bucket: 'stale_60d', totalSku: 0 },
          { bucket: 'normal', totalSku: Math.max(0, v.skuCount - v.stale30SkuCount) }
        ];
      }
      // Stale-merchant DISTINCT (aggregateStaleSkuStats) — distinct from total merchant count.
      if (/distinctMerchants/i.test(sql)) {
        return [{ distinctMerchants: v.distinctMerchants }];
      }
      // Total distinct merchants on ContentPackage (countDistinctMerchants).
      if (/DISTINCT "merchantId"/i.test(sql) && /AS "c"/i.test(sql)) {
        return [{ c: v.merchantCount }];
      }
      return [];
    })
  } as unknown as PrismaService;
};

describe('OverviewService.getKpis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 6-block KPI structure with ratio computed', async () => {
    const svc = new OverviewService(buildPrisma());
    const k = await svc.getKpis();
    expect(k).toMatchObject({
      totalMerchants: 100,
      totalSkus: 500,
      zeroSalesSkuCount: 42,
      zeroSalesMerchants: 12,
      todayGmvFen: 1234567n,
      todayOrderCount: 78,
      updatedAt: '2026-07-13T07:30:00.000Z',
      dataSource: 'OrderHeader'
    });
    // 42/500 = 0.084
    expect(k.zeroSalesSkuRatio).toBeCloseTo(0.084, 4);
  });

  it('handles zero totalSkus without NaN', async () => {
    const svc = new OverviewService(buildPrisma({ skuCount: 0 }));
    const k = await svc.getKpis();
    expect(k.zeroSalesSkuRatio).toBe(0);
  });

  it('date 透传：传指定日期不会用 today', async () => {
    const svc = new OverviewService(buildPrisma());
    const k = await svc.getKpis('2026-06-01');
    expect(k.date).toBe('2026-06-01');
    expect(k.dataSource).toBe('OrderHeader');
  });

  it('invalidateCache 后重新走 DB', async () => {
    const prisma = buildPrisma();
    const svc = new OverviewService(prisma);
    await svc.getKpis();
    await svc.getKpis(); // 命中缓存
    expect((prisma.contentPackage.count as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    svc.invalidateCache();
    await svc.getKpis();
    expect((prisma.contentPackage.count as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('force 绕过 service TTL 并重新读取本地数据库', async () => {
    const prisma = buildPrisma();
    const svc = new OverviewService(prisma);
    await svc.getKpis('2026-08-05');
    await svc.getKpis('2026-08-05');
    expect(prisma.contentPackage.count as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);

    await svc.getKpis('2026-08-05', true);

    expect(prisma.contentPackage.count as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });

  it('keeps updatedAt tied to the source when the GET clock changes and leaves empty days null', async () => {
    const sourceUpdatedAt = '2026-06-01 03:04:05';
    const svc = new OverviewService(buildPrisma({ sourceUpdatedAt }));

    const first = await svc.getKpis('2026-06-01', true);
    vi.setSystemTime(new Date('2026-07-14T08:00:00Z'));
    const second = await svc.getKpis('2026-06-01', true);

    expect(first.updatedAt).toBe('2026-06-01T03:04:05.000Z');
    expect(second.updatedAt).toBe(first.updatedAt);

    const empty = await new OverviewService(
      buildPrisma({ todayGmv: 0, todayOrderCount: 0, sourceUpdatedAt: null })
    ).getKpis('2026-06-02', true);
    expect(empty.updatedAt).toBeNull();
  });
});
