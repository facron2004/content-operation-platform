/** Consolidated GMV module. */
import { shiftDateKey } from '@content/shared';
import { clampListPage, clampListPageSize } from '../common';
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
  paidOrderCount: number;
  paidAmountBonusFen: bigint | null;
  paidAmountWalletFen: bigint | null;
  updatedAt: Date;
};

export function mapDailyMetricsToKpi(
  dmRow: DailyMetricsKpiRow,
  extras?: {
    monthGmvFen?: bigint | null;
    monthGmvOnlineFen?: bigint | null;
    monthGmvWalletFen?: bigint | null;
    prev?: DailyMetricsKpiRow | null;
  }
): GmvTodayPayload {
  const grossGmvFen = BigInt(
    Math.round(
      Number(dmRow.totalGmvFen ?? (dmRow as unknown as { totalGmv?: number }).totalGmv ?? 0) *
        (dmRow.totalGmvFen != null ? 1 : 100)
    )
  );
  const totalRefundFen = BigInt(
    Math.round(
      Number(
        dmRow.totalRefundFen ?? (dmRow as unknown as { totalRefund?: number }).totalRefund ?? 0
      ) * (dmRow.totalRefundFen != null ? 1 : 100)
    )
  );
  const totalGmvFen = grossGmvFen - totalRefundFen;
  const paidOrderCount = dmRow.paidOrderCount ?? 0;
  const avgOrderValue = paidOrderCount > 0 ? Number(totalGmvFen) / 100 / paidOrderCount : 0;
  const monthGmvFen = extras?.monthGmvFen ?? totalGmvFen;
  const monthGmvOnlineFen = extras?.monthGmvOnlineFen ?? dmRow.gmvOnlineFen ?? 0n;
  const monthGmvWalletFen = extras?.monthGmvWalletFen ?? dmRow.gmvWalletFen ?? 0n;

  let compare: GmvTodayPayload['compare'];
  if (extras?.prev) {
    const prevGrossGmvFen = BigInt(
      Math.round(
        Number(
          extras.prev.totalGmvFen ?? (extras.prev as unknown as { totalGmv?: number }).totalGmv ?? 0
        ) * (extras.prev.totalGmvFen != null ? 1 : 100)
      )
    );
    const prevRefundFen = BigInt(
      Math.round(
        Number(
          extras.prev.totalRefundFen ??
            (extras.prev as unknown as { totalRefund?: number }).totalRefund ??
            0
        ) * (extras.prev.totalRefundFen != null ? 1 : 100)
      )
    );
    const prevGmvFen = prevGrossGmvFen - prevRefundFen;
    const prevOrders = extras.prev.paidOrderCount ?? 0;
    const prevAov = prevOrders > 0 ? Number(prevGmvFen) / 100 / prevOrders : 0;
    compare = {
      totalGmv: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      totalGmvFen: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      paidOrderCount: ratioDelta(paidOrderCount, prevOrders),
      avgOrderValue: ratioDelta(avgOrderValue, prevAov),
      refundRate: ratioDelta(Number(dmRow.refundRate ?? 0), Number(extras.prev.refundRate ?? 0)),
      verifyRate: ratioDelta(Number(dmRow.verifyRate ?? 0), Number(extras.prev.verifyRate ?? 0))
    };
  }

  return {
    date: dmRow.date,
    totalGmv: Number(totalGmvFen) / 100,
    monthGmv: Number(monthGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: dmRow.gmvOnlineFen,
    gmvWalletFen: dmRow.gmvWalletFen,
    gmvBonusFen: dmRow.gmvBonusFen,
    gmvCardFen: dmRow.gmvCardFen,
    totalRefundFen: dmRow.totalRefundFen,
    refundRate: Number(dmRow.refundRate),
    refundOrderCount: Number(dmRow.refundCount),
    totalVerifyFen: dmRow.totalVerifyFen,
    verifyRate: Number(dmRow.verifyRate),
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
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
};
export function mapDailyMetricsTrendRow(r: DailyMetricsTrendRow): GmvTrendPoint {
  const grossGmvFen = BigInt(
    Math.round(
      Number(r.totalGmvFen ?? (r as unknown as { totalGmv?: number }).totalGmv ?? 0) *
        (r.totalGmvFen != null ? 1 : 100)
    )
  );
  const totalRefundFen = BigInt(
    Math.round(
      Number(r.totalRefundFen ?? (r as unknown as { totalRefund?: number }).totalRefund ?? 0) *
        (r.totalRefundFen != null ? 1 : 100)
    )
  );
  const totalGmvFen = grossGmvFen - totalRefundFen;
  return {
    date: r.date,
    totalGmv: Number(totalGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: r.gmvOnlineFen,
    gmvWalletFen: r.gmvWalletFen,
    gmvBonusFen: r.gmvBonusFen,
    totalRefundFen: r.totalRefundFen,
    refundRate: Number(r.refundRate ?? 0),
    verifyRate: Number(r.verifyRate ?? 0),
    paidOrderCount: r.paidOrderCount ?? 0
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
  const safeTotalGmvFen = BigInt(Number(totalGmvFen ?? 0));
  const getGmvNum = (r: (typeof rows)[number]) => Number(r.gmvFen ?? r.gmv ?? 0);
  const topGmv = rows.reduce((s, r) => s + BigInt(getGmvNum(r)), 0n);
  const items: (GmvDistributionRow & { totalGmv?: number })[] = rows.map((r) => {
    const gmvVal = r.gmvFen ?? r.gmv ?? 0;
    const onlineVal = r.gmvOnlineFen ?? r.gmvOnline ?? 0;
    const walletVal = r.gmvWalletFen ?? r.gmvWallet ?? 0;
    const bonusVal = r.gmvBonusFen ?? r.gmvBonus ?? 0;
    return {
      key: r.key,
      totalGmv: Number(gmvVal),
      totalGmvFen: BigInt(Number(gmvVal)),
      gmvOnlineFen: BigInt(Number(onlineVal)),
      gmvWalletFen: BigInt(Number(walletVal)),
      gmvBonusFen: BigInt(Number(bonusVal)),
      share: safeTotalGmvFen > 0n ? Number(gmvVal) / Number(safeTotalGmvFen) : 0
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
    const aGmv = Number(a.gmvFen ?? (a as any).gmv ?? 0) - (a.gmvFen != null ? aRefund : 0);
    const bGmv = Number(b.gmvFen ?? (b as any).gmv ?? 0) - (b.gmvFen != null ? bRefund : 0);
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
