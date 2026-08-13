/** Ranking and grouped drill-down queries for the data-analysis report. */
import {
  type DataAnalysisRateRow,
  type DataAnalysisRefundRow,
  type DataAnalysisRankRow
} from './data-analysis.dto';
import {
  IS_VERIFIED,
  MERCHANT_NAME,
  PAID_WHERE,
  type PrismaLike,
  REFUND_AMOUNT_FEN,
  SALESMAN_NAME,
  n,
  rate,
  rateByCount
} from './data-analysis-query.shared';
import { paidTimeBounds } from './data-analysis-window';

// Keep package-ranking exports at this layer for old data-analysis imports.
export {
  mergePackageRankingByName,
  queryPackageRanking,
  resolvePackageDisplayName
} from './data-analysis-package-ranking';

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
    const walletAmount = n(r.walletAmount);
    const refundAmount = n(r.refundAmount);
    const verifiedCount = n(r.verifiedCount);
    return {
      rank: i + 1,
      name: r.name?.trim() || emptyLabel,
      orderCount,
      salesAmount,
      faceAmount: n(r.faceAmount),
      walletAmount,
      refundAmount,
      verifiedCount,
      verifyRate: rateByCount(verifiedCount, orderCount),
      avgOrderValue: rate(salesAmount + walletAmount - refundAmount, orderCount)
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
         COALESCE(SUM(${REFUND_AMOUNT_FEN()}) / 100.0, 0) AS "refundAmount"
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
      COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount",
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
  )) as Array<{ name: string; orderCount: number; verifiedCount: number; verifyRate: number }>;
  const high = (await prisma.$queryRawUnsafe(
    `${base} ORDER BY "verifyRate" DESC, "orderCount" DESC, "name" ASC LIMIT ?`,
    startBound,
    endBound,
    minOrders,
    limit
  )) as Array<{ name: string; orderCount: number; verifiedCount: number; verifyRate: number }>;

  const map = (rows: typeof low): DataAnalysisRateRow[] =>
    rows.map((r) => {
      const orderCount = n(r.orderCount);
      return {
        name: r.name,
        orderCount,
        verifyRate: rateByCount(n(r.verifiedCount), orderCount)
      };
    });
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
       COALESCE(SUM(CASE WHEN ${REFUND_AMOUNT_FEN()} > 0 THEN 1 ELSE 0 END), 0) AS "orderCount",
       COALESCE(SUM(${REFUND_AMOUNT_FEN()}) / 100.0, 0) AS "refundAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount",
       COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE} ${namedFilter}
     GROUP BY ${groupExpr}
     HAVING COALESCE(SUM(${REFUND_AMOUNT_FEN()}), 0) > 0
     ORDER BY "refundAmount" DESC, "orderCount" DESC, "name" ASC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as Array<{
    name: string;
    orderCount: number;
    refundAmount: number;
    verifiedCount: number;
    paidOrderCount: number;
  }>;

  return rows.map((r) => {
    const orderCount = n(r.orderCount);
    return {
      name: r.name,
      orderCount,
      refundAmount: n(r.refundAmount),
      verifyRate: rateByCount(n(r.verifiedCount), n(r.paidOrderCount))
    };
  });
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
