/** Merchant-sales ranking queries, cap metadata, and page projection. */
import type { PrismaService } from '../prisma/prisma.service';
import { GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import { SQL_GMV_SS } from '../common/gmv-math';
import { rateByCount } from '../common';
import { whereArgsForWindow, whereClauseForWindow, sortColumn } from './merchant-sales-window';
import { queryMerchantDistinctPackageCounts } from './merchant-sales-summary-query';
import type {
  MerchantSalesRankingRow,
  MerchantSalesSort,
  MerchantSalesWindow
} from './merchant-sales.dto';

export type RankingSqlRow = {
  merchantName: string;
  areaName: string | null;
  gmv: number | null;
  gmvRefund: number | null;
  gmvVerify: number | null;
  refundCount: number | null;
  verifyCount: number | null;
  paidOrderCount: number | null;
  orderCount: number | null;
  packageCount: number | null;
};

export function mapRankingRow(r: RankingSqlRow): MerchantSalesRankingRow {
  const gmv = Number(r.gmv),
    refund = Number(r.gmvRefund),
    verify = Number(r.gmvVerify);
  const refundCount = Number(r.refundCount),
    verifyCount = Number(r.verifyCount),
    paidOrderCount = Number(r.paidOrderCount);
  return {
    merchantName: r.merchantName,
    areaName: r.areaName,
    gmv,
    gmvRefund: refund,
    gmvVerify: verify,
    // Unified 单数口径: 退款率 = 退款单数 / 支付单数, 核销率 = 核销单数 / 支付单数.
    refundRate: rateByCount(refundCount, paidOrderCount),
    verifyRate: rateByCount(verifyCount, paidOrderCount),
    paidOrderCount,
    orderCount: Number(r.orderCount),
    packageCount: Number(r.packageCount)
  };
}

export function applyMerchantPackageCounts(
  rows: RankingSqlRow[],
  counts: Map<string, number>
): RankingSqlRow[] {
  return rows.map((r) => ({
    ...r,
    packageCount: counts.get(r.merchantName) ?? 0
  }));
}

/**
 * Full sorted merchant ranking (no page). Cap at GMV_TOP_MERCHANTS_LIMIT so TTL
 * cache stays bounded; page flips slice in memory (parity GMV top-merchants).
 */
export async function queryAllRankingRows(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  sortBy: MerchantSalesSort
): Promise<MerchantSalesRankingRow[]> {
  const orderColumn = sortColumn(sortBy),
    whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  // Residual #253: packageCount via OrderHeader DISTINCT (not SUM of daily counts).
  const [moneyRows, packageCounts] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "merchantName", MAX("areaName") AS "areaName", COALESCE(SUM(${SQL_GMV_SS}) / 100.0, 0) AS "gmv", COALESCE(SUM("refundAmountFen") / 100.0, 0) AS "gmvRefund", COALESCE(SUM("verifyAmountFen") / 100.0, 0) AS "gmvVerify", COALESCE(SUM("refundCount"), 0) AS "refundCount", COALESCE(SUM("verifyCount"), 0) AS "verifyCount", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COALESCE(SUM("orderCount"), 0) AS "orderCount", 0 AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "merchantName" ORDER BY ${orderColumn} DESC, "merchantName" ASC LIMIT ?`,
      ...whereArgs,
      GMV_TOP_MERCHANTS_LIMIT
    ) as Promise<RankingSqlRow[]>,
    queryMerchantDistinctPackageCounts(prisma, start, end)
  ]);
  return applyMerchantPackageCounts(moneyRows, packageCounts).map(mapRankingRow);
}

export async function queryRankingRows(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  sortBy: MerchantSalesSort,
  page: number,
  pageSize: number
): Promise<{ items: MerchantSalesRankingRow[]; hasMore: boolean }> {
  const all = await queryAllRankingRows(prisma, window, start, end, sortBy);
  const offset = (page - 1) * pageSize;
  const slice = all.slice(offset, offset + pageSize);
  return {
    items: slice,
    hasMore: all.length > offset + pageSize
  };
}

export type RankingPageMeta = {
  /** Real DISTINCT merchant count in the window (may exceed the ranking head). */
  totalMerchants: number;
  /** Cap applied by queryAllRankingRows (GMV_TOP_MERCHANTS_LIMIT). */
  limit: number;
};

export async function loadRankingPage(
  prisma: PrismaService,
  args: { window: MerchantSalesWindow; sortBy: MerchantSalesSort; page: number; pageSize: number },
  start: string,
  end: string
) {
  // Prefer page-less aggregate path for callers that cache then slice.
  // Residual #264: parallel real COUNT so SPA can flag the LIMIT cap.
  const [all, totalMerchants] = await Promise.all([
    queryAllRankingRows(prisma, args.window, start, end, args.sortBy),
    countMerchants(prisma, args.window, start, end)
  ]);
  return paginateRankingRows(all, args.page, args.pageSize, {
    totalMerchants,
    limit: GMV_TOP_MERCHANTS_LIMIT
  });
}

export function paginateRankingRows(
  all: MerchantSalesRankingRow[],
  page: number,
  pageSize: number,
  meta?: RankingPageMeta
): {
  items: MerchantSalesRankingRow[];
  pagination: { page: number; pageSize: number; hasMore: boolean; total: number };
  limit?: number;
  truncated?: boolean;
  totalMerchants?: number;
} {
  const offset = (page - 1) * pageSize;
  const items = all.slice(offset, offset + pageSize);
  const limit = meta?.limit ?? GMV_TOP_MERCHANTS_LIMIT;
  const totalMerchants = meta?.totalMerchants;
  // Cap honesty: head full OR real COUNT exceeds materialised rows.
  const truncated =
    totalMerchants !== undefined
      ? all.length >= limit || totalMerchants > all.length
      : all.length >= limit;
  return {
    items,
    pagination: {
      page,
      pageSize,
      hasMore: all.length > offset + pageSize,
      // Page math stays over the capped head (not totalMerchants).
      total: all.length
    },
    limit,
    truncated,
    ...(totalMerchants !== undefined ? { totalMerchants } : {})
  };
}

export async function countMerchants(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string
): Promise<number> {
  const whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  const row = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "merchantName") AS "c" FROM "MerchantDailyMetrics" WHERE ${whereClause}`,
    ...whereArgs
  )) as Array<{ c: number | null }>;
  return Number(row[0]?.c ?? 0);
}
