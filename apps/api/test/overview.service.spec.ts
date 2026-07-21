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
    stale30SkuCount: number;
    distinctMerchants: number;
  }> = {}
) => {
  const defaults = {
    merchantCount: 100,
    skuCount: 500,
    todayGmv: 12345.67,
    todayOrderCount: 78,
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
        return [{ totalGmv: v.todayGmv, paidOrderCount: v.todayOrderCount }];
      }
      if (
        /OrderHeader/i.test(sql) &&
        /paidAmount\s*\+\s*"paidAmountWallet"|paidAmount" \+ "paidAmountWallet/i.test(sql)
      ) {
        return [{ totalGmv: v.todayGmv, gmv: v.todayGmv, paidOrderCount: v.todayOrderCount }];
      }
      if (/stale30SkuCount/i.test(sql))
        return [{ stale30SkuCount: v.stale30SkuCount, distinctMerchants: v.distinctMerchants }];
      if (/DISTINCT "merchantId"/i.test(sql)) return [{ c: v.merchantCount }];
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
      todayGmv: 12345.67,
      todayOrderCount: 78,
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
});
