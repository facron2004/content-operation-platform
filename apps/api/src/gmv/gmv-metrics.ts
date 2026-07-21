/** Consolidated GMV module. */
import { shiftDateKey } from '@content/shared';
import {
  emptyTrendPoint,
  type GmvDistributionRow,
  type GmvMerchantRow,
  type GmvMerchantSort,
  type GmvTodayPayload,
  type GmvTrendPoint
} from './gmv.dto';

// --- gmv-daily-metrics-kpi.ts ---
export type DailyMetricsKpiRow = {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  gmvCard: number;
  totalRefund: number;
  refundRate: number;
  totalVerify: number;
  verifyRate: number;
  paidOrderCount: number;
  paidAmountBonus: number;
  paidAmountWallet: number;
  updatedAt: Date;
};

export function mapDailyMetricsToKpi(
  dmRow: DailyMetricsKpiRow,
  extras?: {
    monthGmv?: number;
    monthGmvOnline?: number;
    monthGmvWallet?: number;
    prev?: DailyMetricsKpiRow | null;
  }
): GmvTodayPayload {
  const totalGmv = Number(dmRow.totalGmv);
  const paidOrderCount = dmRow.paidOrderCount;
  const avgOrderValue = paidOrderCount > 0 ? totalGmv / paidOrderCount : 0;
  const monthGmv = Number(extras?.monthGmv ?? totalGmv);
  const monthGmvOnline = Number(extras?.monthGmvOnline ?? dmRow.gmvOnline);
  const monthGmvWallet = Number(extras?.monthGmvWallet ?? dmRow.gmvWallet);

  let compare: GmvTodayPayload['compare'];
  if (extras?.prev) {
    const prevGmv = Number(extras.prev.totalGmv);
    const prevOrders = extras.prev.paidOrderCount;
    const prevAov = prevOrders > 0 ? prevGmv / prevOrders : 0;
    compare = {
      totalGmv: ratioDelta(totalGmv, prevGmv),
      paidOrderCount: ratioDelta(paidOrderCount, prevOrders),
      avgOrderValue: ratioDelta(avgOrderValue, prevAov),
      refundRate: ratioDelta(Number(dmRow.refundRate), Number(extras.prev.refundRate)),
      verifyRate: ratioDelta(Number(dmRow.verifyRate), Number(extras.prev.verifyRate))
    };
  }

  return {
    date: dmRow.date,
    totalGmv,
    gmvOnline: Number(dmRow.gmvOnline),
    gmvWallet: Number(dmRow.gmvWallet),
    gmvBonus: Number(dmRow.gmvBonus),
    gmvCard: Number(dmRow.gmvCard),
    totalRefund: Number(dmRow.totalRefund),
    refundRate: Number(dmRow.refundRate),
    totalVerify: Number(dmRow.totalVerify),
    verifyRate: Number(dmRow.verifyRate),
    paidOrderCount,
    paidAmountBonus: Number(dmRow.paidAmountBonus),
    paidAmountWallet: Number(dmRow.paidAmountWallet),
    avgOrderValue,
    monthGmv,
    monthGmvOnline,
    monthGmvWallet,
    platformCommission: 0,
    compare,
    updatedAt: dmRow.updatedAt.toISOString(),
    dataSource: 'DailyMetrics'
  };
}

function ratioDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

// --- gmv-daily-metrics-trend-map.ts ---
export type DailyMetricsTrendRow = {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  totalRefund: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
};
export function mapDailyMetricsTrendRow(r: DailyMetricsTrendRow): GmvTrendPoint {
  return {
    date: r.date,
    totalGmv: Number(r.totalGmv),
    gmvOnline: Number(r.gmvOnline),
    gmvWallet: Number(r.gmvWallet),
    gmvBonus: Number(r.gmvBonus),
    totalRefund: Number(r.totalRefund),
    refundRate: Number(r.refundRate),
    verifyRate: Number(r.verifyRate),
    paidOrderCount: r.paidOrderCount
  };
}

// --- gmv-daily-metrics-trend.ts ---
export function mapDailyMetricsTrend(
  dmRows: DailyMetricsTrendRow[],
  start: string,
  days: number
): GmvTrendPoint[] {
  const result = dmRows.map(mapDailyMetricsTrendRow);
  const byDate = new Map(result.map((p) => [p.date, p]));
  const filled: GmvTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i);
    filled.push(byDate.get(d) ?? emptyTrendPoint(d));
  }
  return filled;
}

// --- gmv-distribution-map.ts ---
export function mapDistributionRows(
  rows: Array<{ key: string; gmv: number; gmvOnline: number; gmvWallet: number; gmvBonus: number }>,
  totalGmv: number
): GmvDistributionRow[] {
  const topGmv = rows.reduce((s, r) => s + Number(r.gmv), 0);
  const result: GmvDistributionRow[] = rows.map((r) => ({
    key: r.key,
    totalGmv: Number(r.gmv),
    gmvOnline: Number(r.gmvOnline),
    gmvWallet: Number(r.gmvWallet),
    gmvBonus: Number(r.gmvBonus),
    share: Number(r.gmv) / totalGmv
  }));
  if (topGmv < totalGmv) {
    const otherGmv = totalGmv - topGmv;
    result.push({
      key: '其他',
      totalGmv: otherGmv,
      gmvOnline: otherGmv,
      gmvWallet: 0,
      gmvBonus: 0,
      share: otherGmv / totalGmv
    });
  }
  return result;
}

// --- gmv-merchant-page.ts ---
export function sortAndPageMerchants(
  merchants: GmvMerchantRow[],
  sortBy: GmvMerchantSort,
  page: number,
  pageSize: number
): { items: GmvMerchantRow[]; hasMore: boolean } {
  const sorted = [...merchants];
  sorted.sort((a, b) => {
    if (sortBy === 'refundDesc')
      return b.gmvRefund - a.gmvRefund || a.merchantName.localeCompare(b.merchantName);
    if (sortBy === 'verifyDesc')
      return b.gmvVerify - a.gmvVerify || a.merchantName.localeCompare(b.merchantName);
    return b.gmv - a.gmv || a.merchantName.localeCompare(b.merchantName);
  });
  const offset = (page - 1) * pageSize,
    paged = sorted.slice(offset, offset + pageSize);
  return { items: paged, hasMore: paged.length === pageSize && sorted.length > offset + pageSize };
}
