/** Consolidated refund module. */
import { beijingDateKey, endOfMonthKey, shiftDateKey, startOfWeekKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  clampListPage,
  clampListPageSize,
  rateByCount,
  SQL_GMV_OH,
  sqlDatetimeExclusiveRange
} from '../common';
import { GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import type { TopMerchantRow } from './refund.dto';

export type RefundWindow = 'day' | 'week' | 'month' | 'year';

/**
 * Resolve a Beijing calendar period anchored on `date` (defaults to today).
 * Mirrors merchant-sales window semantics but without the 90d interactive cap,
 * so year (≤366d) is allowed for refund/verify analytics.
 */
export function resolveRefundWindow(
  window: RefundWindow,
  date?: string
): { start: string; end: string } {
  const today = beijingDateKey(new Date());
  const anchor = date ?? today;
  if (window === 'day') return { start: anchor, end: anchor };
  if (window === 'year') {
    const yearStart = `${anchor.slice(0, 4)}-01-01`;
    const yearEnd = `${anchor.slice(0, 4)}-12-31`;
    const end = yearEnd < today ? yearEnd : today;
    return { start: yearStart, end: end < yearStart ? yearStart : end };
  }
  const periodStart = window === 'week' ? startOfWeekKey(anchor) : `${anchor.slice(0, 7)}-01`;
  const periodEnd = window === 'week' ? shiftDateKey(periodStart, 6) : endOfMonthKey(anchor);
  const end = periodEnd < today ? periodEnd : today;
  return { start: periodStart, end: end < periodStart ? periodStart : end };
}

// --- refund-top-merchants-query.ts ---
export type RawTopMerchant = {
  merchantName: string;
  merchantId: string;
  gmvFen: bigint | null;
  refundFen: bigint | null;
  verifyFen: bigint | null;
  paidOrderCount: number;
  refundCount: number;
  verifyCount: number;
};

/**
 * Full sorted merchant ranking for the given window (no page).
 *
 * FIX: the metric filter (`refundAmountFen > 0` / verified) used to live in the
 * WHERE clause, which clipped gmvFen + paidOrderCount to only the
 * refunded/verified order subset — producing a WRONG GMV for high-refund
 * merchants. It now lives in HAVING so the group still aggregates the merchant's
 * ENTIRE order book (GMV + paid orders), while only merchants that actually have
 * refunds/verifications appear in the ranking.
 *
 * Refund/verify amounts and counts use conditional aggregation so they measure
 * the metric subset within the same full-order group.
 */
export async function fetchTopMerchantsRaw(
  prisma: PrismaService,
  sortBy: 'refundDesc' | 'verifyDesc' | string,
  start: string,
  end: string
): Promise<RawTopMerchant[]> {
  const { start: startBound, end: endBound } = {
    start: beijingDayRangeSqlite(start).start,
    end: beijingDayRangeSqlite(end).end
  };
  const orderColumn = sortBy === 'verifyDesc' ? '"verifyFen"' : '"refundFen"';
  const metricFilter =
    sortBy === 'verifyDesc'
      ? 'COALESCE(SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN oh."verifyAmountFen" ELSE 0 END), 0) > 0'
      : 'COALESCE(SUM(oh."refundAmountFen"), 0) > 0';
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(oh."merchantName", ''), oh."merchantId") AS "merchantName", oh."merchantId", COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen", COALESCE(SUM(oh."refundAmountFen"), 0) AS "refundFen", COALESCE(SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN oh."verifyAmountFen" ELSE 0 END), 0) AS "verifyFen", COUNT(CASE WHEN oh."paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount", COUNT(CASE WHEN oh."refundAmountFen" > 0 THEN 1 END) AS "refundCount", COUNT(CASE WHEN oh."verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount" FROM "OrderHeader" oh WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')} AND oh."merchantId" IS NOT NULL GROUP BY oh."merchantId" HAVING ${metricFilter} ORDER BY ${orderColumn} DESC, oh."merchantId" ASC LIMIT ?`,
    startBound,
    endBound,
    GMV_TOP_MERCHANTS_LIMIT
  )) as RawTopMerchant[];
}

export type TopMerchantsPage = {
  items: TopMerchantRow[];
  hasMore: boolean;
  /** Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty (parity merchant-sales #264 / GMV). */
  limit: number;
  truncated: boolean;
};

export function pageTopMerchants(
  items: TopMerchantRow[],
  page: number,
  pageSize: number
): TopMerchantsPage {
  // Defense-in-depth clamp (parity GMV pageMerchants; residual #85).
  const safePage = clampListPage(page);
  const safePageSize = clampListPageSize(pageSize, 100, 20);
  const offset = (safePage - 1) * safePageSize;
  const paged = items.slice(offset, offset + safePageSize);
  const limit = GMV_TOP_MERCHANTS_LIMIT;
  // Head-full means SQL LIMIT may have clipped the true merchant set.
  const truncated = items.length >= limit;
  return {
    items: paged,
    hasMore: items.length > offset + safePageSize,
    limit,
    truncated
  };
}

// --- refund-top-merchants.ts ---
function mapTopMerchant(row: RawTopMerchant): TopMerchantRow {
  const gmv = Number(row.gmvFen ?? 0) / 100,
    refund = Number(row.refundFen ?? 0) / 100,
    verify = Number(row.verifyFen ?? 0) / 100;
  const paidOrderCount = Number(row.paidOrderCount ?? 0);
  return {
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    areaName: null,
    gmv,
    refund,
    verify,
    // Unified 单数口径: 退款单数 / 支付单数, 核销单数 / 支付单数.
    refundRate: rateByCount(Number(row.refundCount ?? 0), paidOrderCount),
    verifyRate: rateByCount(Number(row.verifyCount ?? 0), paidOrderCount),
    paidOrderCount
  };
}

/** Full sorted ranking (no page) — callers cache then paginateRanking-style. */
export async function queryAllTopMerchants(
  prisma: PrismaService,
  sortBy: 'refundDesc' | 'verifyDesc' | string,
  window: RefundWindow = 'week',
  date?: string
): Promise<TopMerchantRow[]> {
  const { start, end } = resolveRefundWindow(window, date);
  const allItems = (await fetchTopMerchantsRaw(prisma, sortBy, start, end)).map(mapTopMerchant);
  // SQL already ORDER BY; keep stable secondary sort if driver reorders.
  if (sortBy === 'verifyDesc') {
    allItems.sort((a, b) => b.verify - a.verify || a.merchantId.localeCompare(b.merchantId));
  } else {
    allItems.sort((a, b) => b.refund - a.refund || a.merchantId.localeCompare(b.merchantId));
  }
  return allItems;
}

export async function queryTopMerchantsWindow(
  prisma: PrismaService,
  sortBy: 'refundDesc' | 'verifyDesc' | string,
  page: number,
  pageSize: number,
  window: RefundWindow = 'week',
  date?: string
): Promise<TopMerchantsPage> {
  const all = await queryAllTopMerchants(prisma, sortBy, window, date);
  return pageTopMerchants(all, page, pageSize);
}
