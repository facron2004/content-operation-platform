/** Merchant-sales summary aggregates and distinct package counts. */
import type { PrismaService } from '../prisma/prisma.service';
import { SQL_GMV_SS } from '../common/gmv-math';
import { beijingDayRangeSqlite, sqlDatetimeExclusiveRange } from '../common/sqlite-datetime';
import { whereArgsForWindow, whereClauseForWindow } from './merchant-sales-window';
import type { MerchantSalesSummary, MerchantSalesWindow } from './merchant-sales.dto';

type AggregateRow = {
  totalGmv: number | null;
  totalRefund: number | null;
  totalVerify: number | null;
  refundCount: number | null;
  verifyCount: number | null;
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
      refundCount: 0,
      verifyCount: 0,
      paidOrderCount: 0,
      merchantCount: 0,
      packageCount: 0
    },
    totalGmv = Number(r.totalGmv),
    totalRefund = Number(r.totalRefund),
    totalVerify = Number(r.totalVerify),
    refundCount = Number(r.refundCount),
    verifyCount = Number(r.verifyCount),
    paidOrderCount = Number(r.paidOrderCount);
  // Unified 单数口径: 退款率 = 退款单数 / 支付单数, 核销率 = 核销单数 / 支付单数.
  const safeRate = (numerator: number) => (paidOrderCount > 0 ? numerator / paidOrderCount : 0);
  return {
    window,
    date: start,
    endDate: end,
    totalGmv,
    totalRefund,
    totalVerify,
    refundRate: safeRate(refundCount),
    verifyRate: safeRate(verifyCount),
    paidOrderCount,
    merchantCount: Number(r.merchantCount),
    packageCount: Number(r.packageCount),
    dataSource: totalGmv > 0 || totalRefund > 0 ? 'MerchantDailyMetrics' : 'empty'
  };
}

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
 * Per-merchant distinct packages in [start, end].
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
      `SELECT COALESCE(SUM(${SQL_GMV_SS}) / 100.0, 0) AS "totalGmv", COALESCE(SUM("refundAmountFen"), 0) / 100.0 AS "totalRefund", COALESCE(SUM("verifyAmountFen"), 0) / 100.0 AS "totalVerify", COALESCE(SUM("refundCount"), 0) AS "refundCount", COALESCE(SUM("verifyCount"), 0) AS "verifyCount", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount", COUNT(DISTINCT "merchantName") AS "merchantCount", 0 AS "packageCount" FROM "MerchantDailyMetrics" WHERE ${whereClause}`,
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
