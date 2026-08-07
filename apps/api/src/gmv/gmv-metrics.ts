/** Consolidated GMV module. */
import { shiftDateKey } from '@content/shared';
import {
  clampListPage,
  clampListPageSize,
  netGmvParts,
  rateByCount,
  toFenBigInt
} from '../common';
import { GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import {
  emptyTrendPoint,
  type GmvDistributionPayload,
  type GmvDistributionRow,
  type GmvMerchantRow,
  type GmvMerchantSort,
  type GmvTodayPayload,
  type GmvTrendPoint
} from './gmv.dto';

// --- gmv-daily-metrics-kpi.ts ---
export type DailyMetricsKpiRow = {
  date: string;
  totalGmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  gmvCardFen: bigint | null;
  totalRefundFen: bigint | null;
  refundRate: number;
  refundCount: number;
  totalVerifyFen: bigint | null;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
  paidAmountBonusFen: bigint | null;
  paidAmountWalletFen: bigint | null;
  updatedAt: Date;
};

/** 单数口径: 退款率 = 退款单数 / 支付单数, 核销率 = 核销单数 / 支付单数. (不再使用金额口径) */

export function mapDailyMetricsToKpi(
  dmRow: DailyMetricsKpiRow,
  extras?: {
    monthGmvFen?: bigint | null;
    monthGmvOnlineFen?: bigint | null;
    monthGmvWalletFen?: bigint | null;
    prev?: DailyMetricsKpiRow | null;
  }
): GmvTodayPayload {
  const grossGmvFen = toFenBigInt(
    dmRow.totalGmvFen ?? (dmRow as unknown as { totalGmv?: number }).totalGmv,
    dmRow.totalGmvFen != null ? 1 : 100
  );
  const totalRefundFen = toFenBigInt(
    dmRow.totalRefundFen ?? (dmRow as unknown as { totalRefund?: number }).totalRefund,
    dmRow.totalRefundFen != null ? 1 : 100
  );
  const totalGmvFen = grossGmvFen - totalRefundFen;
  const onlineFen = toFenBigInt(
    dmRow.gmvOnlineFen ?? (dmRow as unknown as { gmvOnline?: number }).gmvOnline,
    dmRow.gmvOnlineFen != null ? 1 : 100
  );
  const walletFen = toFenBigInt(
    dmRow.gmvWalletFen ?? (dmRow as unknown as { gmvWallet?: number }).gmvWallet,
    dmRow.gmvWalletFen != null ? 1 : 100
  );
  const netParts = netGmvParts(onlineFen, walletFen, totalRefundFen);
  const paidOrderCount = dmRow.paidOrderCount ?? 0;
  const avgOrderValue = paidOrderCount > 0 ? Number(totalGmvFen) / 100 / paidOrderCount : 0;
  const monthGmvFen = extras?.monthGmvFen ?? totalGmvFen;
  const monthGmvOnlineFen = extras?.monthGmvOnlineFen ?? netParts.onlineFen;
  const monthGmvWalletFen = extras?.monthGmvWalletFen ?? netParts.walletFen;
  const refundRate = rateByCount(Number(dmRow.refundCount), paidOrderCount);
  const verifyRate = rateByCount(Number(dmRow.verifyCount), paidOrderCount);

  let compare: GmvTodayPayload['compare'];
  if (extras?.prev) {
    const prevGrossGmvFen = toFenBigInt(
      extras.prev.totalGmvFen ?? (extras.prev as unknown as { totalGmv?: number }).totalGmv,
      extras.prev.totalGmvFen != null ? 1 : 100
    );
    const prevRefundFen = toFenBigInt(
      extras.prev.totalRefundFen ??
        (extras.prev as unknown as { totalRefund?: number }).totalRefund,
      extras.prev.totalRefundFen != null ? 1 : 100
    );
    const prevGmvFen = prevGrossGmvFen - prevRefundFen;
    const prevOrders = extras.prev.paidOrderCount ?? 0;
    const prevAov = prevOrders > 0 ? Number(prevGmvFen) / 100 / prevOrders : 0;
    const prevRefundRate = rateByCount(Number(extras.prev.refundCount ?? 0), prevOrders);
    const prevVerifyRate = rateByCount(Number(extras.prev.verifyCount ?? 0), prevOrders);
    compare = {
      totalGmv: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      totalGmvFen: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      paidOrderCount: ratioDelta(paidOrderCount, prevOrders),
      avgOrderValue: ratioDelta(avgOrderValue, prevAov),
      refundRate: ratioDelta(refundRate, prevRefundRate),
      verifyRate: ratioDelta(verifyRate, prevVerifyRate)
    };
  }

  return {
    date: dmRow.date,
    totalGmv: Number(totalGmvFen) / 100,
    monthGmv: Number(monthGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: netParts.onlineFen,
    gmvWalletFen: netParts.walletFen,
    gmvBonusFen: dmRow.gmvBonusFen,
    gmvCardFen: dmRow.gmvCardFen,
    totalRefundFen: dmRow.totalRefundFen,
    refundRate,
    refundOrderCount: Number(dmRow.refundCount),
    verifyOrderCount: Number(dmRow.verifyCount),
    totalVerifyFen: dmRow.totalVerifyFen,
    verifyRate,
    paidOrderCount,
    paidAmountBonusFen: dmRow.paidAmountBonusFen,
    paidAmountWalletFen: dmRow.paidAmountWalletFen,
    avgOrderValue,
    monthGmvFen,
    monthGmvOnlineFen,
    monthGmvWalletFen,
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
  totalGmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  totalRefundFen: bigint | null;
  totalVerifyFen?: bigint | null;
  refundRate: number;
  verifyRate: number;
  refundCount: number;
  verifyCount: number;
  paidOrderCount: number;
};
export function mapDailyMetricsTrendRow(r: DailyMetricsTrendRow): GmvTrendPoint {
  const grossGmvFen = toFenBigInt(
    r.totalGmvFen ?? (r as unknown as { totalGmv?: number }).totalGmv,
    r.totalGmvFen != null ? 1 : 100
  );
  const totalRefundFen = toFenBigInt(
    r.totalRefundFen ?? (r as unknown as { totalRefund?: number }).totalRefund,
    r.totalRefundFen != null ? 1 : 100
  );
  const totalGmvFen = grossGmvFen - totalRefundFen;
  const onlineFen = toFenBigInt(r.gmvOnlineFen);
  const walletFen = toFenBigInt(r.gmvWalletFen);
  const netParts = netGmvParts(onlineFen, walletFen, totalRefundFen);
  const paidOrderCount = r.paidOrderCount ?? 0;
  const refundCount = Number(r.refundCount ?? 0);
  const verifyCount = Number(r.verifyCount ?? 0);
  const refundRate = rateByCount(refundCount, paidOrderCount);
  const verifyRate = rateByCount(verifyCount, paidOrderCount);
  return {
    date: r.date,
    totalGmv: Number(totalGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: netParts.onlineFen,
    gmvWalletFen: netParts.walletFen,
    gmvBonusFen: r.gmvBonusFen,
    totalRefundFen,
    refundRate,
    verifyRate,
    paidOrderCount,
    refundCount,
    verifyCount
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
/**
 * Residual #289: project Top-N named buckets + optional synthetic 「其他」 long-tail,
 * plus honesty fields so SPA can banner when head is incomplete.
 *
 * `limit` is the requested named-bucket head (SQL LIMIT). `matched` is at-least
 * `limit + 1` when truncated (long-tail remainder exists) — no extra COUNT(*) of
 * distinct keys. Share denominators stay platform totalGmv (not re-based on head).
 */
export function mapDistributionRows(
  rows: Array<{
    key: string;
    gmvFen?: bigint | number | null;
    gmvOnlineFen?: bigint | number | null;
    gmvWalletFen?: bigint | number | null;
    gmvBonusFen?: bigint | number | null;
    refundFen?: bigint | number | null;
    gmv?: number;
    gmvOnline?: number;
    gmvWallet?: number;
    gmvBonus?: number;
  }>,
  totalGmvFen: bigint | number,
  limit?: number
): GmvDistributionPayload {
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : rows.length;
  const safeTotalGmvFen = toFenBigInt(totalGmvFen);
  const getGmvFen = (r: (typeof rows)[number]) => toFenBigInt(r.gmvFen ?? r.gmv);
  const topGmv = rows.reduce((s, r) => s + getGmvFen(r), 0n);
  const items: (GmvDistributionRow & { totalGmv?: number })[] = rows.map((r) => {
    const gmvVal = r.gmvFen ?? r.gmv ?? 0;
    const onlineVal = r.gmvOnlineFen ?? r.gmvOnline ?? 0;
    const walletVal = r.gmvWalletFen ?? r.gmvWallet ?? 0;
    const bonusVal = r.gmvBonusFen ?? r.gmvBonus ?? 0;
    const refundVal = r.refundFen ?? 0;
    const netParts =
      r.refundFen == null
        ? { onlineFen: toFenBigInt(onlineVal), walletFen: toFenBigInt(walletVal) }
        : netGmvParts(toFenBigInt(onlineVal), toFenBigInt(walletVal), toFenBigInt(refundVal));
    const gmvFen = toFenBigInt(gmvVal);
    const bonusFen = toFenBigInt(bonusVal);
    return {
      key: r.key,
      totalGmv: Number(gmvFen),
      totalGmvFen: gmvFen,
      gmvOnlineFen: netParts.onlineFen,
      gmvWalletFen: netParts.walletFen,
      gmvBonusFen: bonusFen,
      share: safeTotalGmvFen > 0n ? Number(gmvFen) / Number(safeTotalGmvFen) : 0
    };
  });
  // Residual #289: long-tail remainder means head was capped.
  const truncated = safeTotalGmvFen > 0n && topGmv < safeTotalGmvFen;
  if (truncated) {
    const otherGmv = safeTotalGmvFen - topGmv;
    items.push({
      key: '其他',
      totalGmv: Number(otherGmv),
      totalGmvFen: otherGmv,
      gmvOnlineFen: otherGmv,
      gmvWalletFen: 0n,
      gmvBonusFen: 0n,
      share: Number(otherGmv) / Number(safeTotalGmvFen)
    });
  }
  return {
    items,
    limit: safeLimit,
    // When truncated we know at least one extra named bucket exists beyond the head.
    matched: truncated ? Math.max(safeLimit + 1, rows.length + 1) : rows.length,
    truncated
  };
}

// --- gmv-merchant-page.ts ---
/** Sort merchants by the requested metric (no page). */
export function sortMerchants(
  merchants: GmvMerchantRow[],
  sortBy: GmvMerchantSort
): GmvMerchantRow[] {
  const sorted = [...merchants];
  sorted.sort((a, b) => {
    const aRefund = Number(a.gmvRefundFen ?? (a as any).gmvRefund ?? 0);
    const bRefund = Number(b.gmvRefundFen ?? (b as any).gmvRefund ?? 0);
    if (sortBy === 'refundDesc')
      return bRefund - aRefund || a.merchantName.localeCompare(b.merchantName);
    if (sortBy === 'verifyDesc')
      return (
        Number(b.gmvVerifyFen ?? (b as any).gmvVerify ?? 0) -
          Number(a.gmvVerifyFen ?? (a as any).gmvVerify ?? 0) ||
        a.merchantName.localeCompare(b.merchantName)
      );
    // The fen path is already net GMV from SQL_GMV_SS; only the legacy float
    // fallback still carries gross GMV and needs the refund subtraction.
    const aGmv =
      a.gmvFen != null
        ? Number(a.gmvFen)
        : Number((a as unknown as { gmv?: number }).gmv ?? 0) - aRefund;
    const bGmv =
      b.gmvFen != null
        ? Number(b.gmvFen)
        : Number((b as unknown as { gmv?: number }).gmv ?? 0) - bRefund;
    return bGmv - aGmv || a.merchantName.localeCompare(b.merchantName);
  });
  return sorted;
}

export type GmvMerchantPage = {
  items: GmvMerchantRow[];
  hasMore: boolean;
  /** Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty (parity merchant-sales #264). */
  limit: number;
  truncated: boolean;
};

export function pageMerchants(
  sorted: GmvMerchantRow[],
  page: number,
  pageSize: number
): GmvMerchantPage {
  // Defense-in-depth: DTO Max already bounds interactive callers; still clamp here
  // so internal/miswired call sites cannot OFFSET into huge cached rankings.
  const safePage = clampListPage(page);
  const safePageSize = clampListPageSize(pageSize, 100, 20);
  const offset = (safePage - 1) * safePageSize,
    paged = sorted.slice(offset, offset + safePageSize);
  const limit = GMV_TOP_MERCHANTS_LIMIT;
  // Head-full means SQL LIMIT may have clipped the true merchant set.
  const truncated = sorted.length >= limit;
  return {
    items: paged,
    hasMore: paged.length === safePageSize && sorted.length > offset + safePageSize,
    limit,
    truncated
  };
}

export function sortAndPageMerchants(
  merchants: GmvMerchantRow[],
  sortBy: GmvMerchantSort,
  page: number,
  pageSize: number
): GmvMerchantPage {
  return pageMerchants(sortMerchants(merchants, sortBy), page, pageSize);
}
