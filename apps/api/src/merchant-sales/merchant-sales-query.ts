/** Consolidated merchant-sales module. */
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

// --- merchant-sales-summary.ts ---
export async function querySummary(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string
): Promise<MerchantSalesSummary> {
  const whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  const row = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "totalGmv", COALESCE(SUM("refundAmount"), 0) AS "totalRefund", COALESCE(SUM("verifyAmount"), 0) AS "totalVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COUNT(DISTINCT "merchantName") AS "merchantCount", COALESCE(SUM("packageCount"), 0) AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause}`,
    ...whereArgs
  )) as AggregateRow[];
  return mapSummaryAggregate(row[0], window, start, end);
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
export async function queryRankingRows(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  sortBy: MerchantSalesSort,
  page: number,
  pageSize: number
): Promise<{ items: MerchantSalesRankingRow[]; hasMore: boolean }> {
  const orderColumn = sortColumn(sortBy),
    offset = (page - 1) * pageSize,
    whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "merchantName", MAX("areaName") AS "areaName", COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "gmv", COALESCE(SUM("refundAmount"), 0) AS "gmvRefund", COALESCE(SUM("verifyAmount"), 0) AS "gmvVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COALESCE(SUM("orderCount"), 0) AS "orderCount", COALESCE(SUM("packageCount"), 0) AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "merchantName" ORDER BY ${orderColumn} DESC, "merchantName" ASC LIMIT ? OFFSET ?`,
    ...whereArgs,
    pageSize + 1,
    offset
  )) as RankingSqlRow[];
  return {
    items: (rows.length > pageSize ? rows.slice(0, pageSize) : rows).map(mapRankingRow),
    hasMore: rows.length > pageSize
  };
}

// --- merchant-sales-ranking-page.ts ---
export async function loadRankingPage(
  prisma: PrismaService,
  args: { window: MerchantSalesWindow; sortBy: MerchantSalesSort; page: number; pageSize: number },
  start: string,
  end: string
) {
  const { items, hasMore } = await queryRankingRows(
    prisma,
    args.window,
    start,
    end,
    args.sortBy,
    args.page,
    args.pageSize
  );
  const total = await countMerchants(prisma, args.window, start, end);
  return { items, pagination: { page: args.page, pageSize: args.pageSize, hasMore, total } };
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
  return (await prisma.$queryRawUnsafe(
    `SELECT "merchantName", MAX("areaName") AS "areaName", COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "gmv", COALESCE(SUM("refundAmount"), 0) AS "gmvRefund", COALESCE(SUM("verifyAmount"), 0) AS "gmvVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COALESCE(SUM("orderCount"), 0) AS "orderCount", COALESCE(SUM("packageCount"), 0) AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "merchantName" ORDER BY ${orderColumn} DESC, "merchantName" ASC`,
    ...whereArgs
  )) as RankingSqlRow[];
}

// --- merchant-sales-export.ts ---
export async function queryExportCsv(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  sortBy: MerchantSalesSort
): Promise<string> {
  const rows = await loadMerchantSalesExportRows(prisma, window, start, end, sortColumn(sortBy));
  return buildMerchantSalesCsv(rows, window, start, end);
}

// --- merchant-sales-metrics-sql.ts ---
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
SELECT
  COALESCE(NULLIF(oh."merchantName", ''), '(未知)') AS "merchantName",
  date(oh."paidTime", '+8 hours') AS "date",
  (
    SELECT oh2."areaName"
    FROM "OrderHeader" oh2
    WHERE oh2."merchantName" = COALESCE(NULLIF(oh."merchantName", ''), '(未知)')
      AND date(oh2."paidTime", '+8 hours') = date(oh."paidTime", '+8 hours')
      AND oh2."areaName" IS NOT NULL
      AND oh2."areaName" <> ''
      AND oh2."paidTime" IS NOT NULL
    ORDER BY oh2."paidTime" DESC
    LIMIT 1
  ) AS "areaName",
  SUM(CASE WHEN oh."paidTime" IS NOT NULL THEN 1 ELSE 0 END) AS "paidOrderCount",
  COALESCE(SUM(oh."paidAmount"), 0) AS "paidAmountOnline",
  COALESCE(SUM(oh."paidAmountWallet"), 0) AS "paidAmountWallet",
  COALESCE(SUM(oh."paidAmountBonus"), 0) AS "paidAmountBonus",
  COALESCE(SUM(oh."paidAmountCard"), 0) AS "paidAmountCard",
  COALESCE(SUM(oh."refundAmount"), 0) AS "refundAmount",
  COALESCE(SUM(oh."verifyAmount"), 0) AS "verifyAmount",
  COUNT(*) AS "orderCount",
  COUNT(DISTINCT oh."packageId") AS "packageCount",
  CURRENT_TIMESTAMP AS "updatedAt"
FROM "OrderHeader" oh
WHERE oh."paidTime" IS NOT NULL
  AND date(oh."paidTime", '+8 hours') >= ?
  AND date(oh."paidTime", '+8 hours') <= ?
GROUP BY
  COALESCE(NULLIF(oh."merchantName", ''), '(未知)'),
  date(oh."paidTime", '+8 hours');
`;

// --- merchant-sales-metrics-recompute.ts ---
export async function recomputeMerchantDailyMetrics(
  prisma: PrismaService,
  startDate: string,
  endDate: string
): Promise<number> {
  const inserted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM "MerchantDailyMetrics" WHERE "date" >= ? AND "date" <= ?`,
      startDate,
      endDate
    );
    return tx.$executeRawUnsafe(MERCHANT_DAILY_METRICS_INSERT_SQL, startDate, endDate);
  });
  return Number(inserted ?? 0);
}
