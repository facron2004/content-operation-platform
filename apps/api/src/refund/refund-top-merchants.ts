/** Consolidated refund module. */
import { beijingDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  clampListPage,
  clampListPageSize,
  rateAgainstGmv,
  SQL_GMV_OH,
  sqlDatetimeExclusiveRange
} from '../common';
import { GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import type { TopMerchantRow } from './refund.dto';

// --- refund-top-merchants-query.ts ---
export type RawTopMerchant = {
  merchantName: string;
  merchantId: string;
  gmvFen: bigint | null;
  refundFen: bigint | null;
  verifyFen: bigint | null;
  paidOrderCount: number;
};

/**
 * Full sorted merchant ranking for the trailing 7d refund window (no page).
 * Refunds are attributed to the order day (orderTime) — refund count is filtered by the
 * day the order was placed, not the day the refund occurred. Same caliber as the refund
 * dashboard / DailyMetrics (orderTime-based refund attribution).
 * Cap at GMV_TOP_MERCHANTS_LIMIT so TTL cache stays bounded; page flips slice
 * in memory (parity GMV top-merchants / merchant-sales ranking).
 */
export async function fetchTopMerchantsRaw(
  prisma: PrismaService,
  sortBy: 'refundDesc' | 'verifyDesc' | string = 'refundDesc'
): Promise<RawTopMerchant[]> {
  const dayKey = beijingDateKey(new Date());
  const { end: dayEnd } = beijingDayRangeSqlite(dayKey);
  const weekStart = beijingDayRangeSqlite(beijingDateKey(Date.now() - 6 * 86400000)).start;
  const orderColumn = sortBy === 'verifyDesc' ? '"verifyFen"' : '"refundFen"';
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(oh."merchantName", ''), oh."merchantId") AS "merchantName", oh."merchantId", COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen", COALESCE(SUM(oh."refundAmountFen"), 0) AS "refundFen", COALESCE(SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN oh."verifyAmountFen" ELSE 0 END), 0) AS "verifyFen", COUNT(CASE WHEN oh."paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" oh WHERE ${sqlDatetimeExclusiveRange('oh."orderTime"')} AND "refundAmountFen" > 0 AND oh."merchantId" IS NOT NULL GROUP BY oh."merchantId" ORDER BY ${orderColumn} DESC, oh."merchantId" ASC LIMIT ?`,
    weekStart,
    dayEnd,
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
  return {
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    areaName: null,
    gmv,
    refund,
    verify,
    refundRate: rateAgainstGmv(refund, gmv),
    verifyRate: rateAgainstGmv(verify, gmv),
    paidOrderCount: Number(row.paidOrderCount)
  };
}

/** Full sorted ranking (no page) — callers cache then paginateRanking-style. */
export async function queryAllTopMerchants(
  prisma: PrismaService,
  sortBy: 'refundDesc' | 'verifyDesc' | string
): Promise<TopMerchantRow[]> {
  const allItems = (await fetchTopMerchantsRaw(prisma, sortBy)).map(mapTopMerchant);
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
  pageSize: number
): Promise<TopMerchantsPage> {
  const all = await queryAllTopMerchants(prisma, sortBy);
  return pageTopMerchants(all, page, pageSize);
}
