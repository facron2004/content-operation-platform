/** Consolidated merchant-sales module. */
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CSV_EXPORT_MAX_ROWS, GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import {
  beijingDayRangeSqlite,
  sqlBeijingDate,
  sqlDatetime,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common/sqlite-datetime';
import {
  bucketExprFor,
  csvCell,
  sortColumn,
  whereArgsForWindow,
  whereClauseForWindow
} from './merchant-sales-window';
import type {
  MerchantSalesRankingRow,
  MerchantSalesSort,
  MerchantSalesSummary,
  MerchantSalesTrendPoint,
  MerchantSalesWindow
} from './merchant-sales.dto';

// --- merchant-sales-summary-map.ts ---
type AggregateRow = {
  totalGmv: number | null;
  totalRefund: number | null;
  totalVerify: number | null;
  paidOrderCount: number | null;
  merchantCount: number | null;
  packageCount: number | null;
};
export function mapSummaryAggregate(
  row: AggregateRow | undefined,
  window: MerchantSalesWindow,
  start: string,
  end: string
): MerchantSalesSummary {
  const r = row ?? {
      totalGmv: 0,
      totalRefund: 0,
      totalVerify: 0,
      paidOrderCount: 0,
      merchantCount: 0,
      packageCount: 0
    },
    totalGmv = Number(r.totalGmv),
    totalRefund = Number(r.totalRefund),
    totalVerify = Number(r.totalVerify);
  return {
    window,
    date: start,
    endDate: end,
    totalGmv,
    totalRefund,
    totalVerify,
    refundRate: totalGmv > 0 ? totalRefund / totalGmv : 0,
    verifyRate: totalGmv > 0 ? totalVerify / totalGmv : 0,
    paidOrderCount: Number(r.paidOrderCount),
    merchantCount: Number(r.merchantCount),
    packageCount: Number(r.packageCount),
    dataSource: totalGmv > 0 || totalRefund > 0 ? 'MerchantDailyMetrics' : 'empty'
  };
}

// --- merchant-sales-package-count.ts ---
/**
 * Residual #253: MerchantDailyMetrics.packageCount is per-day COUNT(DISTINCT
 * packageId). SUM across multi-day windows double-counts packages active on
 * multiple days, while SPA labels 「动销 SKU」/「动销SKU数」 imply distinct SKUs.
 * Money aggregates stay on MerchantDailyMetrics (SUM is correct); packageCount
 * re-aggregates from OrderHeader over the same paidTime half-open window used
 * by recompute (capped at MERCHANT_SALES_READ_MAX_DAYS).
 */
function paidTimeArgsForRange(start: string, end: string): [string, string] {
  return [beijingDayRangeSqlite(start).start, beijingDayRangeSqlite(end).end];
}

/** Global distinct packages in [start, end] Beijing days (summary KPI). */
export async function queryDistinctPackageCount(
  prisma: PrismaService,
  start: string,
  end: string
): Promise<number> {
  const [paidStart, paidEnd] = paidTimeArgsForRange(start, end);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "packageId") AS "packageCount" FROM "OrderHeader" WHERE "paidTime" IS NOT NULL AND "packageId" IS NOT NULL AND "packageId" <> '' AND ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    paidStart,
    paidEnd
  )) as Array<{ packageCount: number | null }>;
  return Number(rows[0]?.packageCount ?? 0);
}

/**
 * Per-merchant distinct packages in [start, end] Beijing days.
 * Merchant name normalization matches MERCHANT_DAILY_METRICS_INSERT_SQL.
 */
export async function queryMerchantDistinctPackageCounts(
  prisma: PrismaService,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const [paidStart, paidEnd] = paidTimeArgsForRange(start, end);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF("merchantName", ''), '(未知)') AS "merchantName", COUNT(DISTINCT "packageId") AS "packageCount" FROM "OrderHeader" WHERE "paidTime" IS NOT NULL AND "packageId" IS NOT NULL AND "packageId" <> '' AND ${sqlDatetimeExclusiveRange('"paidTime"')} GROUP BY COALESCE(NULLIF("merchantName", ''), '(未知)')`,
    paidStart,
    paidEnd
  )) as Array<{ merchantName: string; packageCount: number | null }>;
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.merchantName, Number(r.packageCount ?? 0));
  }
  return map;
}

function applyMerchantPackageCounts(
  rows: RankingSqlRow[],
  counts: Map<string, number>
): RankingSqlRow[] {
  return rows.map((r) => ({
    ...r,
    packageCount: counts.get(r.merchantName) ?? 0
  }));
}

// --- merchant-sales-summary.ts ---
export async function querySummary(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string
): Promise<MerchantSalesSummary> {
  const whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  // Money + merchantCount from day grain; packageCount from OrderHeader DISTINCT.
  const [moneyRows, packageCount] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "totalGmv", COALESCE(SUM("refundAmount"), 0) AS "totalRefund", COALESCE(SUM("verifyAmount"), 0) AS "totalVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COUNT(DISTINCT "merchantName") AS "merchantCount", 0 AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause}`,
      ...whereArgs
    ) as Promise<AggregateRow[]>,
    queryDistinctPackageCount(prisma, start, end)
  ]);
  const base = moneyRows[0] ?? {
    totalGmv: 0,
    totalRefund: 0,
    totalVerify: 0,
    paidOrderCount: 0,
    merchantCount: 0,
    packageCount: 0
  };
  return mapSummaryAggregate({ ...base, packageCount }, window, start, end);
}

// --- merchant-sales-ranking-map.ts ---
export type RankingSqlRow = {
  merchantName: string;
  areaName: string | null;
  gmv: number | null;
  gmvRefund: number | null;
  gmvVerify: number | null;
  paidOrderCount: number | null;
  orderCount: number | null;
  packageCount: number | null;
};
export function mapRankingRow(r: RankingSqlRow): MerchantSalesRankingRow {
  const gmv = Number(r.gmv),
    refund = Number(r.gmvRefund),
    verify = Number(r.gmvVerify);
  return {
    merchantName: r.merchantName,
    areaName: r.areaName,
    gmv,
    gmvRefund: refund,
    gmvVerify: verify,
    refundRate: gmv > 0 ? refund / gmv : 0,
    verifyRate: gmv > 0 ? verify / gmv : 0,
    paidOrderCount: Number(r.paidOrderCount),
    orderCount: Number(r.orderCount),
    packageCount: Number(r.packageCount)
  };
}

// --- merchant-sales-ranking.ts ---
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
      `SELECT "merchantName", MAX("areaName") AS "areaName", COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "gmv", COALESCE(SUM("refundAmount"), 0) AS "gmvRefund", COALESCE(SUM("verifyAmount"), 0) AS "gmvVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COALESCE(SUM("orderCount"), 0) AS "orderCount", 0 AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "merchantName" ORDER BY ${orderColumn} DESC, "merchantName" ASC LIMIT ?`,
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

// --- merchant-sales-ranking-page.ts ---
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

// --- merchant-sales-trend-map.ts ---
export function mapTrendRows(
  rows: Array<{
    bucket: string;
    totalGmv: number | null;
    totalRefund: number | null;
    totalVerify: number | null;
    paidOrderCount: number | null;
  }>
): MerchantSalesTrendPoint[] {
  return rows.map((r) => ({
    bucket: r.bucket,
    totalGmv: Number(r.totalGmv),
    totalRefund: Number(r.totalRefund),
    totalVerify: Number(r.totalVerify),
    paidOrderCount: Number(r.paidOrderCount)
  }));
}

// --- merchant-sales-trend-query.ts ---
export async function queryTrendRows(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string
): Promise<MerchantSalesTrendPoint[]> {
  const bucketExpr = bucketExprFor(window),
    whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${bucketExpr} AS "bucket", COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "totalGmv", COALESCE(SUM("refundAmount"), 0) AS "totalRefund", COALESCE(SUM("verifyAmount"), 0) AS "totalVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "bucket" ORDER BY "bucket" ASC`,
    ...whereArgs
  )) as Array<{
    bucket: string;
    totalGmv: number | null;
    totalRefund: number | null;
    totalVerify: number | null;
    paidOrderCount: number | null;
  }>;
  return mapTrendRows(rows);
}

// --- merchant-sales-count.ts ---
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

// --- merchant-sales-export-format.ts ---
const CSV_HEADER = [
  '商家',
  '区域',
  'GMV',
  '退款金额',
  '核销金额',
  '退款率',
  '核销率',
  '成单数',
  '订单数',
  '动销SKU数',
  '窗口',
  '起始日',
  '结束日'
];
export function buildMerchantSalesCsv(
  rows: RankingSqlRow[],
  window: MerchantSalesWindow,
  start: string,
  end: string
): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    const gmv = Number(r.gmv),
      refund = Number(r.gmvRefund),
      verify = Number(r.gmvVerify);
    lines.push(
      [
        csvCell(r.merchantName),
        csvCell(r.areaName ?? ''),
        gmv.toFixed(2),
        refund.toFixed(2),
        verify.toFixed(2),
        gmv > 0 ? (refund / gmv).toFixed(4) : '0',
        gmv > 0 ? (verify / gmv).toFixed(4) : '0',
        String(r.paidOrderCount),
        String(r.orderCount),
        String(r.packageCount),
        window,
        start,
        end
      ].join(',')
    );
  }
  return '﻿' + lines.join('\r\n');
}

// --- merchant-sales-export-rows.ts ---
export async function loadMerchantSalesExportRows(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  orderColumn: string
): Promise<RankingSqlRow[]> {
  const whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  // Cap export rows to prevent multi-MB CSV / unbounded GROUP BY on full history.
  // Bind CSV_EXPORT_MAX_ROWS so merchant-sales export tracks the platform CSV ceiling.
  // Residual #253: packageCount via OrderHeader DISTINCT (not SUM of daily counts).
  const [moneyRows, packageCounts] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "merchantName", MAX("areaName") AS "areaName", COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "gmv", COALESCE(SUM("refundAmount"), 0) AS "gmvRefund", COALESCE(SUM("verifyAmount"), 0) AS "gmvVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COALESCE(SUM("orderCount"), 0) AS "orderCount", 0 AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "merchantName" ORDER BY ${orderColumn} DESC, "merchantName" ASC LIMIT ?`,
      ...whereArgs,
      CSV_EXPORT_MAX_ROWS
    ) as Promise<RankingSqlRow[]>,
    queryMerchantDistinctPackageCounts(prisma, start, end)
  ]);
  return applyMerchantPackageCounts(moneyRows, packageCounts);
}

// --- merchant-sales-export.ts ---
export type MerchantSalesExportResult = {
  csv: string;
  /** Residual #263: honesty meta for X-Export-* headers. */
  total: number;
  truncated: boolean;
  limit: number;
};

export async function queryExportCsv(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  sortBy: MerchantSalesSort
): Promise<MerchantSalesExportResult> {
  const [rows, total] = await Promise.all([
    loadMerchantSalesExportRows(prisma, window, start, end, sortColumn(sortBy)),
    countMerchants(prisma, window, start, end)
  ]);
  const limit = CSV_EXPORT_MAX_ROWS;
  const truncated = rows.length >= limit || total > rows.length;
  return {
    csv: buildMerchantSalesCsv(rows, window, start, end),
    total,
    truncated,
    limit
  };
}

// --- merchant-sales-metrics-sql.ts ---
/**
 * Recompute MerchantDailyMetrics for a Beijing date range.
 *
 * areaName used to be a correlated subquery over OrderHeader per (merchant, day)
 * group — O(groups × day-rows). Rewrite: filter once into `base`, pick latest
 * non-empty area via ROW_NUMBER in `area_pick`, then aggregate + scalar join.
 * Empty merchantName normalizes to '(未知)' on both sides so area resolves
 * (correlated form compared raw '' to '(未知)' and always missed).
 */
export const MERCHANT_DAILY_METRICS_INSERT_SQL = `
INSERT OR REPLACE INTO "MerchantDailyMetrics" (
  "merchantName",
  "date",
  "areaName",
  "paidOrderCount",
  "paidAmountOnline",
  "paidAmountWallet",
  "paidAmountBonus",
  "paidAmountCard",
  "refundAmount",
  "verifyAmount",
  "orderCount",
  "packageCount",
  "updatedAt"
)
WITH base AS (
  SELECT
    COALESCE(NULLIF(oh."merchantName", ''), '(未知)') AS "merchantName",
    ${sqlBeijingDate('oh."paidTime"')} AS "dateKey",
    oh."areaName" AS "areaName",
    oh."paidTime" AS "paidTime",
    oh."paidAmount" AS "paidAmount",
    oh."paidAmountWallet" AS "paidAmountWallet",
    oh."paidAmountBonus" AS "paidAmountBonus",
    oh."paidAmountCard" AS "paidAmountCard",
    oh."refundAmount" AS "refundAmount",
    oh."verifyAmount" AS "verifyAmount",
    oh."packageId" AS "packageId"
  FROM "OrderHeader" oh
  WHERE oh."paidTime" IS NOT NULL
    AND ${sqlDatetimeExclusiveRange('oh."paidTime"')}
),
area_pick AS (
  SELECT
    "merchantName",
    "dateKey",
    "areaName",
    ROW_NUMBER() OVER (
      PARTITION BY "merchantName", "dateKey"
      ORDER BY ${sqlDatetime('"paidTime"')} DESC
    ) AS "rn"
  FROM base
  WHERE "areaName" IS NOT NULL
    AND "areaName" <> ''
)
SELECT
  b."merchantName",
  b."dateKey" AS "date",
  (
    SELECT a."areaName"
    FROM area_pick a
    WHERE a."merchantName" = b."merchantName"
      AND a."dateKey" = b."dateKey"
      AND a."rn" = 1
  ) AS "areaName",
  COUNT(*) AS "paidOrderCount",
  COALESCE(SUM(b."paidAmount"), 0) AS "paidAmountOnline",
  COALESCE(SUM(b."paidAmountWallet"), 0) AS "paidAmountWallet",
  COALESCE(SUM(b."paidAmountBonus"), 0) AS "paidAmountBonus",
  COALESCE(SUM(b."paidAmountCard"), 0) AS "paidAmountCard",
  COALESCE(SUM(b."refundAmount"), 0) AS "refundAmount",
  COALESCE(SUM(b."verifyAmount"), 0) AS "verifyAmount",
  COUNT(*) AS "orderCount",
  COUNT(DISTINCT b."packageId") AS "packageCount",
  ? AS "updatedAt"
FROM base b
GROUP BY
  b."merchantName",
  b."dateKey";
`;

// --- merchant-sales-metrics-recompute.ts ---
export async function recomputeMerchantDailyMetrics(
  prisma: PrismaService,
  startDate: string,
  endDate: string
): Promise<number> {
  const now = toSqliteDateTime();
  // Exclusive half-open paidTime bounds so OrderHeader_paidTime_idx can seek.
  const paidStart = beijingDayRangeSqlite(startDate).start;
  const paidEnd = beijingDayRangeSqlite(endDate).end;
  const inserted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM "MerchantDailyMetrics" WHERE "date" >= ? AND "date" <= ?`,
      startDate,
      endDate
    );
    // Param order matches SQL `?` appearance: exclusive paidTime window then updatedAt.
    return tx.$executeRawUnsafe(MERCHANT_DAILY_METRICS_INSERT_SQL, paidStart, paidEnd, now);
  });
  return Number(inserted ?? 0);
}
