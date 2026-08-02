import { describe, expect, it } from 'vitest';
import { mapDailyMetricsToKpi, mapDailyMetricsTrendRow } from '../src/gmv/gmv-metrics';
import { buildOrderHeaderTodayPayload } from '../src/gmv/gmv-order-header';

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
      paidOrderCount: 2,
      paidAmountBonusFen: 0n,
      paidAmountWalletFen: 2000n,
      updatedAt: new Date()
    };

    const kpi = mapDailyMetricsToKpi(dmRow, {
      monthGmvFen: 50000n // 本月净 GMV 500 元
    });

    // 今日 GMV 应当为净 GMV (100 - 20 = 80 元 -> 8000 分)
    expect(kpi.totalGmvFen).toBe(8000n);
    expect(kpi.totalRefundFen).toBe(2000n);
    expect(kpi.monthGmvFen).toBe(50000n);
    // 客单价按照净 GMV (80元 / 2单 = 40元)
    expect(kpi.avgOrderValue).toBe(40);
  });

  it('buildOrderHeaderTodayPayload subtracts refundFen from grossGmv for Net GMV', () => {
    const gmvRow = {
      paidAmountFen: 8000n,
      paidAmountWalletFen: 2000n,
      paidAmountBonusFen: 0n,
      paidAmountCardFen: 8000n,
      verifyAmountFen: 4000n,
      orderCount: 2
    };

    const payload = buildOrderHeaderTodayPayload(
      '2026-07-31',
      gmvRow as never,
      1500n, // 退款 15 元
      1,
      {
        monthGmvFen: 45000n // 本月净 GMV
      }
    );

    // 今日 GMV = (8000 + 2000) - 1500 = 8500 分 (85元)
    expect(payload.totalGmvFen).toBe(8500n);
    expect(payload.totalRefundFen).toBe(1500n);
    expect(payload.monthGmvFen).toBe(45000n);
    expect(payload.avgOrderValue).toBe(42.5);
  });

  it('mapDailyMetricsTrendRow maps Net GMV for trend points', () => {
    const trendRow = {
      date: '2026-07-31',
      totalGmvFen: 20000n, // 毛 200元
      gmvOnlineFen: 15000n,
      gmvWalletFen: 5000n,
      gmvBonusFen: 0n,
      totalRefundFen: 3000n, // 退款 30元
      refundRate: 0.15,
      verifyRate: 0.6,
      paidOrderCount: 4
    };

    const point = mapDailyMetricsTrendRow(trendRow);
    // 趋势点 GMV 应当为 净 GMV (200 - 30 = 170元 -> 17000 分)
    expect(point.totalGmvFen).toBe(17000n);
    expect(point.totalRefundFen).toBe(3000n);
  });
});
