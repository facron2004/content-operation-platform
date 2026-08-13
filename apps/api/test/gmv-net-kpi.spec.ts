import { describe, expect, it } from 'vitest';
import {
  mapDailyMetricsToKpi,
  mapDailyMetricsTrendRow,
  mapDistributionRows,
  sortMerchants
} from '../src/gmv/gmv-metrics';
import { buildOrderHeaderTodayPayload, mapOrderHeaderTrendRows } from '../src/gmv/gmv-order-header';
import { aggregateTrend, resolveGmvKpis } from '../src/gmv/gmv-resolve';

describe('Net GMV calculation (Gross GMV minus Refund)', () => {
  it('mapDailyMetricsToKpi subtracts totalRefundFen from totalGmvFen for Net GMV', () => {
    const dmRow = {
      date: '2026-07-30',
      totalGmvFen: 10000n, // 毛 GMV 100 元
      gmvOnlineFen: 8000n,
      gmvWalletFen: 2000n,
      gmvBonusFen: 0n,
      gmvCardFen: 8000n,
      totalRefundFen: 2000n, // 退款 20 元
      refundRate: 0.2,
      refundCount: 1,
      totalVerifyFen: 5000n,
      verifyRate: 0.5,
      verifyCount: 1,
      paidOrderCount: 2,
      paidAmountBonusFen: 0n,
      paidAmountWalletFen: 2000n,
      updatedAt: new Date('2026-07-30T12:34:56.000Z')
    };

    const kpi = mapDailyMetricsToKpi(dmRow, {
      monthGmvFen: 50000n // 本月净 GMV 500 元
    });

    // 今日 GMV 应当为净 GMV (100 - 20 = 80 元 -> 8000 分)
    expect(kpi.totalGmvFen).toBe(8000n);
    expect(kpi.totalRefundFen).toBe(2000n);
    expect(kpi.monthGmvFen).toBe(50000n);
    expect(kpi.gmvOnlineFen).toBe(6400n);
    expect(kpi.gmvWalletFen).toBe(1600n);
    expect(kpi.gmvOnlineFen! + kpi.gmvWalletFen!).toBe(kpi.totalGmvFen);
    // 客单价按照净 GMV (80元 / 2单 = 40元)
    expect(kpi.avgOrderValue).toBe(40);
    expect(kpi.refundRate).toBe(0.5);
    expect(kpi.verifyRate).toBe(0.5);
    expect(kpi.updatedAt).toBe('2026-07-30T12:34:56.000Z');
  });

  it('buildOrderHeaderTodayPayload subtracts refundFen from grossGmv for Net GMV', () => {
    const gmvRow = {
      paidAmountFen: 8000n,
      paidAmountWalletFen: 2000n,
      paidAmountBonusFen: 0n,
      paidAmountCardFen: 8000n,
      verifyAmountFen: 4000n,
      orderCount: 2,
      sourceUpdatedAt: '2026-07-31 08:09:10'
    };

    const payload = buildOrderHeaderTodayPayload(
      '2026-07-31',
      gmvRow as never,
      1500n, // 退款 15 元
      {
        monthGmvFen: 45000n, // 本月净 GMV
        monthGmvOnlineFen: 36000n,
        monthGmvWalletFen: 9000n
      }
    );

    // 今日 GMV = (8000 + 2000) - 1500 = 8500 分 (85元)
    expect(payload.totalGmvFen).toBe(8500n);
    expect(payload.totalRefundFen).toBe(1500n);
    expect(payload.gmvOnlineFen).toBe(6800n);
    expect(payload.gmvWalletFen).toBe(1700n);
    expect(payload.gmvOnlineFen! + payload.gmvWalletFen!).toBe(payload.totalGmvFen);
    expect(payload.monthGmvFen).toBe(45000n);
    expect(payload.monthGmvOnlineFen).toBe(36000n);
    expect(payload.monthGmvWalletFen).toBe(9000n);
    expect(payload.avgOrderValue).toBe(42.5);
    expect(payload.updatedAt).toBe('2026-07-31T08:09:10.000Z');

    const fallbackPayload = buildOrderHeaderTodayPayload('2026-07-31', gmvRow as never, 1500n);
    expect(fallbackPayload.monthGmvOnlineFen).toBe(6800n);
    expect(fallbackPayload.monthGmvWalletFen).toBe(1700n);
  });

  it('does not pretend an empty OrderHeader day was updated at GET time', () => {
    const payload = buildOrderHeaderTodayPayload(
      '2026-07-31',
      {
        paidAmountFen: 0n,
        paidAmountWalletFen: 0n,
        paidAmountBonusFen: 0n,
        paidAmountCardFen: 0n,
        verifyAmountFen: 0n,
        orderCount: 0,
        refundOrderCount: 0,
        verifyCount: 0,
        sourceUpdatedAt: null
      },
      0n
    );

    expect(payload.updatedAt).toBeNull();
  });

  it('preserves fen amounts above the JavaScript safe-integer boundary', () => {
    const hugeFen = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
    const daily = mapDailyMetricsToKpi({
      date: '2026-07-31',
      totalGmvFen: hugeFen,
      gmvOnlineFen: hugeFen,
      gmvWalletFen: 0n,
      gmvBonusFen: 0n,
      gmvCardFen: 0n,
      totalRefundFen: 7n,
      refundRate: 0,
      refundCount: 1,
      totalVerifyFen: 11n,
      verifyRate: 0,
      verifyCount: 1,
      paidOrderCount: 1,
      paidAmountBonusFen: 0n,
      paidAmountWalletFen: 0n,
      updatedAt: new Date()
    });

    expect(daily.totalGmvFen).toBe(hugeFen - 7n);
    expect(daily.gmvOnlineFen).toBe(hugeFen - 7n);

    const [trend] = mapOrderHeaderTrendRows(
      [
        {
          date: '2026-07-31',
          paidAmountFen: hugeFen,
          paidAmountWalletFen: 0n,
          paidAmountBonusFen: 0n,
          refundAmountFen: 7n,
          verifyAmountFen: 11n,
          refundOrderCount: 1,
          verifyCount: 1,
          orderCount: 1
        }
      ],
      '2026-07-31',
      '2026-07-31'
    );
    expect(trend.totalGmvFen).toBe(hugeFen - 7n);
    expect(trend.gmvOnlineFen).toBe(hugeFen - 7n);

    const [distribution] = mapDistributionRows(
      [{ key: 'large', gmvFen: hugeFen, gmvOnlineFen: hugeFen, gmvWalletFen: 0n }],
      hugeFen,
      1
    ).items;
    expect(distribution.totalGmvFen).toBe(hugeFen);
  });

  it('keeps the monthly payment breakdown aligned with monthly net GMV', async () => {
    const current = {
      date: '2026-07-31',
      totalGmvFen: 10000n,
      gmvOnlineFen: 8000n,
      gmvWalletFen: 2000n,
      gmvBonusFen: 0n,
      gmvCardFen: 0n,
      totalRefundFen: 2000n,
      refundRate: 0.2,
      refundCount: 1,
      totalVerifyFen: 0n,
      verifyRate: 0,
      paidOrderCount: 1,
      paidAmountBonusFen: 0n,
      paidAmountWalletFen: 2000n,
      updatedAt: new Date('2026-07-31T00:00:00Z')
    };
    const prisma = {
      dailyMetrics: {
        findUnique: async ({ where }: { where: { date: string } }) =>
          where.date === current.date ? current : null,
        findMany: async () => [
          current,
          {
            totalGmvFen: 5000n,
            totalRefundFen: 1000n,
            gmvOnlineFen: 3000n,
            gmvWalletFen: 2000n
          }
        ]
      },
      contentPackage: {},
      orderHeader: {}
    } as never;

    const payload = await resolveGmvKpis(prisma, current.date);

    // Monthly gross channels = 110 + 40, refund = 30; net channels = 88 + 32.
    expect(payload.monthGmvFen).toBe(12000n);
    expect(payload.monthGmvOnlineFen).toBe(8800n);
    expect(payload.monthGmvWalletFen).toBe(3200n);
    expect(payload.monthGmvOnlineFen! + payload.monthGmvWalletFen!).toBe(payload.monthGmvFen);
  });

  it('mapDailyMetricsTrendRow maps Net GMV for trend points', () => {
    const trendRow = {
      date: '2026-07-31',
      totalGmvFen: 20000n, // 毛 200元
      gmvOnlineFen: 15000n,
      gmvWalletFen: 5000n,
      gmvBonusFen: 0n,
      totalRefundFen: 3000n, // 退款 30元
      totalVerifyFen: 5000n,
      refundRate: 0.15,
      refundCount: 1,
      verifyRate: 0.6,
      verifyCount: 2,
      paidOrderCount: 4
    };

    const point = mapDailyMetricsTrendRow(trendRow);
    // 趋势点 GMV 应当为 净 GMV (200 - 30 = 170元 -> 17000 分)
    expect(point.totalGmvFen).toBe(17000n);
    expect(point.totalRefundFen).toBe(3000n);
    expect(point.gmvOnlineFen).toBe(12750n);
    expect(point.gmvWalletFen).toBe(4250n);
    expect(point.gmvOnlineFen! + point.gmvWalletFen!).toBe(point.totalGmvFen);
    expect(point.refundRate).toBeCloseTo(0.25);
    expect(point.verifyRate).toBeCloseTo(0.5);
  });

  it('keeps OrderHeader trend channels equal to net GMV', () => {
    const [point] = mapOrderHeaderTrendRows(
      [
        {
          date: '2026-07-31',
          paidAmountFen: 15000n,
          paidAmountWalletFen: 5000n,
          paidAmountBonusFen: 0n,
          refundAmountFen: 3000n,
          verifyAmountFen: 6000n,
          refundOrderCount: 1,
          verifyCount: 1,
          orderCount: 1
        }
      ],
      '2026-07-31',
      '2026-07-31'
    );

    expect(point.gmvOnlineFen).toBe(12750n);
    expect(point.gmvWalletFen).toBe(4250n);
    expect(point.gmvOnlineFen! + point.gmvWalletFen!).toBe(point.totalGmvFen);
    expect(point.refundRate).toBeCloseTo(1);
    expect(point.verifyRate).toBeCloseTo(1);
  });

  it('aggregates weekly rates from net GMV weighted numerators', () => {
    const [point] = aggregateTrend(
      [
        {
          date: '2026-07-27',
          totalGmv: 80,
          totalGmvFen: 8000n,
          gmvOnlineFen: 8000n,
          gmvWalletFen: 0n,
          gmvBonusFen: 0n,
          totalRefundFen: 2000n,
          refundRate: 0.25,
          verifyRate: 0.5,
          refundCount: 0,
          verifyCount: 1,
          paidOrderCount: 2
        },
        {
          date: '2026-07-28',
          totalGmv: 170,
          totalGmvFen: 17000n,
          gmvOnlineFen: 17000n,
          gmvWalletFen: 0n,
          gmvBonusFen: 0n,
          totalRefundFen: 3000n,
          refundRate: 3000 / 17000,
          verifyRate: 6000 / 17000,
          refundCount: 1,
          verifyCount: 1,
          paidOrderCount: 3
        }
      ],
      'week'
    );

    expect(point.totalGmvFen).toBe(25000n);
    expect(point.totalRefundFen).toBe(5000n);
    expect(point.refundRate).toBe(5000 / 25000);
    expect(point.verifyRate).toBe(10000 / 25000);
  });

  it('projects distribution channels from gross inputs to net GMV', () => {
    const result = mapDistributionRows(
      [
        {
          key: 'area-a',
          gmvFen: 17000n,
          gmvOnlineFen: 15000n,
          gmvWalletFen: 5000n,
          gmvBonusFen: 0n,
          refundFen: 3000n
        }
      ],
      17000n,
      1
    );
    const [item] = result.items;

    expect(item.gmvOnlineFen).toBe(12750n);
    expect(item.gmvWalletFen).toBe(4250n);
    expect(item.gmvOnlineFen! + item.gmvWalletFen!).toBe(item.totalGmvFen);
  });

  it('does not subtract refunds twice when sorting fen merchant GMV', () => {
    const row = (merchantName: string, gmvFen: bigint, gmvRefundFen: bigint) => ({
      merchantId: merchantName,
      merchantName,
      areaName: null,
      gmvFen,
      gmvRefundFen,
      gmvVerifyFen: 0n,
      refundRate: 0,
      verifyRate: 0,
      paidOrderCount: 1
    });

    const sorted = sortMerchants(
      [row('high-refund-net-leader', 1_000n, 900n), row('steady-net', 900n, 0n)],
      'gmvDesc'
    );

    expect(sorted.map((merchant) => merchant.merchantName)).toEqual([
      'high-refund-net-leader',
      'steady-net'
    ]);
  });
});
