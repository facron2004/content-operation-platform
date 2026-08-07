/** Ranking and grouped drill-down queries for the data-analysis report. */
import { sqlDatetimeExclusiveRange } from '../common';
import {
  type DataAnalysisPackageRankRow,
  type DataAnalysisRateRow,
  type DataAnalysisRefundRow,
  type DataAnalysisRankRow
} from './data-analysis.dto';
import {
  IS_VERIFIED,
  MERCHANT_NAME,
  PAID_WHERE,
  type PrismaLike,
  REFUND_COMPONENTS_FEN,
  SALESMAN_NAME,
  n,
  rate
} from './data-analysis-query.shared';
import { paidTimeBounds } from './data-analysis-window';

/**
 * Human label for a package rank row.
 * Never surface raw numeric packageIds — those look like "default placeholders"
 * in the TOP 5 UI when ContentPackage is missing a row (common for fresh JeeSite SKUs).
 */
export function resolvePackageDisplayName(
  packageName: string | null | undefined,
  packageId: string | null | undefined,
  merchantName?: string | null
): string {
  const id = (packageId ?? '').trim();
  const name = (packageName ?? '').trim();
  // Accept a real title only when it is non-empty and not just the id / a bare snowflake.
  if (name && name !== id && !/^\d{12,}$/.test(name)) return name;
  const merchant = (merchantName ?? '').trim();
  if (merchant) return `${merchant} · 套餐未同步`;
  return '（未命名商品）';
}

type PackageIdAggRow = {
  packageId: string | null;
  packageName: string | null;
  merchantName: string | null;
  orderCount: number | null;
  salesAmount: number | null;
};

/**
 * Collapse per-packageId aggregates into per-display-name ranks.
 * JeeSite re-lists the same product under many packageIds; ranking by id
 * fills TOP 5 with duplicate titles. Operators expect one row per product name.
 */
export function mergePackageRankingByName(
  rows: PackageIdAggRow[],
  limit: number
): DataAnalysisPackageRankRow[] {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 5));
  type Acc = {
    packageId: string;
    packageName: string;
    salesAmount: number;
    orderCount: number;
    /** sales of the representative packageId (highest within the name group). */
    leadSales: number;
  };
  const byName = new Map<string, Acc>();

  for (const r of rows) {
    const packageId = r.packageId?.trim() || '';
    const salesAmount = n(r.salesAmount);
    const orderCount = n(r.orderCount);
    const packageName = resolvePackageDisplayName(r.packageName, packageId, r.merchantName);
    const prev = byName.get(packageName);
    if (!prev) {
      byName.set(packageName, {
        packageId,
        packageName,
        salesAmount,
        orderCount,
        leadSales: salesAmount
      });
      continue;
    }
    prev.salesAmount += salesAmount;
    prev.orderCount += orderCount;
    // Keep the packageId that contributes the most sales as the representative id.
    if (
      salesAmount > prev.leadSales ||
      (salesAmount === prev.leadSales && packageId < prev.packageId)
    ) {
      prev.packageId = packageId;
      prev.leadSales = salesAmount;
    }
  }

  return [...byName.values()]
    .sort(
      (a, b) =>
        b.salesAmount - a.salesAmount ||
        b.orderCount - a.orderCount ||
        a.packageName.localeCompare(b.packageName, 'zh')
    )
    .slice(0, safeLimit)
    .map((r, i) => ({
      rank: i + 1,
      packageId: r.packageId,
      packageName: r.packageName,
      // Money is yuan; keep 2dp after multi-id sum (avoids 0.1+0.2 float noise).
      salesAmount: Math.round(r.salesAmount * 100) / 100,
      orderCount: r.orderCount
    }));
}

export async function queryPackageRanking(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit = 5
): Promise<DataAnalysisPackageRankRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 5));
  // Fetch a wider packageId window so same-name SKUs can collapse into TOP N.
  // 40× covers heavy re-list churn (e.g. 19+ ids per 悦得闲 title) without full scan.
  const fetchLimit = Math.min(500, Math.max(safeLimit * 40, safeLimit));
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       COALESCE(NULLIF(TRIM(oh."packageId"), ''), '') AS "packageId",
       NULLIF(TRIM(cp."packageName"), '') AS "packageName",
       NULLIF(TRIM(MAX(oh."merchantName")), '') AS "merchantName",
       COUNT(*) AS "orderCount",
       COALESCE(SUM(oh."paidAmountFen") / 100.0, 0) AS "salesAmount"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY oh."packageId", cp."packageName"
     ORDER BY "salesAmount" DESC, "orderCount" DESC
     LIMIT ?`,
    startBound,
    endBound,
    fetchLimit
  )) as PackageIdAggRow[];

  return mergePackageRankingByName(rows, safeLimit);
}

type RankSqlRow = {
  name: string | null;
  orderCount: number | null;
  salesAmount: number | null;
  faceAmount: number | null;
  walletAmount: number | null;
  refundAmount: number | null;
  verifiedCount: number | null;
};

function mapRankRows(rows: RankSqlRow[], emptyLabel: string): DataAnalysisRankRow[] {
  return rows.map((r, i) => {
    const orderCount = n(r.orderCount);
    const salesAmount = n(r.salesAmount);
    const verifiedCount = n(r.verifiedCount);
    return {
      rank: i + 1,
      name: r.name?.trim() || emptyLabel,
      orderCount,
      salesAmount,
      faceAmount: n(r.faceAmount),
      walletAmount: n(r.walletAmount),
      refundAmount: n(r.refundAmount),
      verifiedCount,
      verifyRate: rate(verifiedCount, orderCount),
      avgOrderValue: rate(salesAmount, orderCount)
    };
  });
}

async function queryRankingBy(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number,
  groupExpr: string,
  emptyLabel: string,
  /** When true, only rows with a non-empty raw name (skip pure placeholder groups). */
  requireNamed = false
): Promise<DataAnalysisRankRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const namedFilter = requireNamed
    ? `AND NULLIF(TRIM(COALESCE("salesman", '')), '') IS NOT NULL`
    : '';
  const rows = (await prisma.$queryRawUnsafe(
    `WITH refundByGroup AS (
       SELECT
         ${groupExpr} AS "name",
         COALESCE(SUM(${REFUND_COMPONENTS_FEN()}) / 100.0, 0) AS "refundAmount"
       FROM "OrderHeader"
       WHERE ${PAID_WHERE} AND "refundAmountFen" > 0
       GROUP BY ${groupExpr}
     )
     SELECT
       ${groupExpr} AS "name",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmountFen") / 100.0, 0) AS "salesAmount",
       COALESCE(SUM("orderAmountFen") / 100.0, 0) AS "faceAmount",
       COALESCE(SUM("paidAmountWalletFen") / 100.0, 0) AS "walletAmount",
       COALESCE(rb."refundAmount", 0) AS "refundAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount"
     FROM "OrderHeader"
     LEFT JOIN refundByGroup rb ON rb."name" = ${groupExpr}
     WHERE ${PAID_WHERE} ${namedFilter}
     GROUP BY ${groupExpr}
     ORDER BY "salesAmount" DESC, "orderCount" DESC, "name" ASC
     LIMIT ?`,
    startBound,
    endBound,
    startBound,
    endBound,
    limit
  )) as RankSqlRow[];
  return mapRankRows(rows, emptyLabel);
}

export async function queryMerchantRanking(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRankRow[]> {
  return queryRankingBy(prisma, startDate, endDate, limit, MERCHANT_NAME, '（未命名商家）');
}

export async function querySalesmanRanking(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRankRow[]> {
  return queryRankingBy(prisma, startDate, endDate, limit, SALESMAN_NAME, '（未命名业务员）', true);
}

async function queryVerifyExtremesBy(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  minOrders: number,
  limit: number,
  groupExpr: string,
  requireNamed = false
): Promise<{ low: DataAnalysisRateRow[]; high: DataAnalysisRateRow[] }> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const namedFilter = requireNamed
    ? `AND NULLIF(TRIM(COALESCE("salesman", '')), '') IS NOT NULL`
    : '';
  const base = `
    SELECT
      ${groupExpr} AS "name",
      COUNT(*) AS "orderCount",
      CAST(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS "verifyRate"
    FROM "OrderHeader"
    WHERE ${PAID_WHERE} ${namedFilter}
    GROUP BY ${groupExpr}
    HAVING COUNT(*) >= ?
  `;
  const low = (await prisma.$queryRawUnsafe(
    `${base} ORDER BY "verifyRate" ASC, "orderCount" DESC, "name" ASC LIMIT ?`,
    startBound,
    endBound,
    minOrders,
    limit
  )) as Array<{ name: string; orderCount: number; verifyRate: number }>;
  const high = (await prisma.$queryRawUnsafe(
    `${base} ORDER BY "verifyRate" DESC, "orderCount" DESC, "name" ASC LIMIT ?`,
    startBound,
    endBound,
    minOrders,
    limit
  )) as Array<{ name: string; orderCount: number; verifyRate: number }>;

  const map = (rows: typeof low): DataAnalysisRateRow[] =>
    rows.map((r) => ({
      name: r.name,
      orderCount: n(r.orderCount),
      verifyRate: n(r.verifyRate)
    }));
  return { low: map(low), high: map(high) };
}

export async function queryMerchantVerifyExtremes(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  minOrders: number,
  limit: number
): Promise<{ low: DataAnalysisRateRow[]; high: DataAnalysisRateRow[] }> {
  return queryVerifyExtremesBy(prisma, startDate, endDate, minOrders, limit, MERCHANT_NAME);
}

export async function querySalesmanVerifyExtremes(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  minOrders: number,
  limit: number
): Promise<{ low: DataAnalysisRateRow[]; high: DataAnalysisRateRow[] }> {
  return queryVerifyExtremesBy(prisma, startDate, endDate, minOrders, limit, SALESMAN_NAME, true);
}

async function queryRefundsBy(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number,
  groupExpr: string,
  requireNamed = false
): Promise<DataAnalysisRefundRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const namedFilter = requireNamed
    ? `AND NULLIF(TRIM(COALESCE("salesman", '')), '') IS NOT NULL`
    : '';
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${groupExpr} AS "name",
       COUNT(*) AS "orderCount",
       COALESCE(SUM(${REFUND_COMPONENTS_FEN()}) / 100.0, 0) AS "refundAmount",
       CAST(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS "verifyRate"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE} AND "refundAmountFen" > 0 ${namedFilter}
     GROUP BY ${groupExpr}
     ORDER BY "refundAmount" DESC, "orderCount" DESC, "name" ASC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as Array<{
    name: string;
    orderCount: number;
    refundAmount: number;
    verifyRate: number;
  }>;

  return rows.map((r) => ({
    name: r.name,
    orderCount: n(r.orderCount),
    refundAmount: n(r.refundAmount),
    verifyRate: n(r.verifyRate)
  }));
}

export async function queryMerchantRefunds(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRefundRow[]> {
  return queryRefundsBy(prisma, startDate, endDate, limit, MERCHANT_NAME);
}

export async function querySalesmanRefunds(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRefundRow[]> {
  return queryRefundsBy(prisma, startDate, endDate, limit, SALESMAN_NAME, true);
}
