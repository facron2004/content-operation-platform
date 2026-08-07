/** Merchant-sales trend query and row mapping. */
import type { PrismaService } from '../prisma/prisma.service';
import { SQL_GMV_SS } from '../common/gmv-math';
import { bucketExprFor, whereArgsForWindow, whereClauseForWindow } from './merchant-sales-window';
import type { MerchantSalesTrendPoint, MerchantSalesWindow } from './merchant-sales.dto';

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

export async function queryTrendRows(
  prisma: PrismaService,
  window: MerchantSalesWindow,
  start: string,
  end: string,
  /** Bucket granularity; defaults to the read window. */
  bucketWindow: MerchantSalesWindow = window
): Promise<MerchantSalesTrendPoint[]> {
  const bucketExpr = bucketExprFor(bucketWindow),
    whereClause = whereClauseForWindow(window),
    whereArgs = whereArgsForWindow(window, start, end);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${bucketExpr} AS "bucket", COALESCE(SUM(${SQL_GMV_SS}) / 100.0, 0) AS "totalGmv", COALESCE(SUM("refundAmountFen") / 100.0, 0) AS "totalRefund", COALESCE(SUM("verifyAmountFen") / 100.0, 0) AS "totalVerify", COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount" FROM "MerchantDailyMetrics" WHERE ${whereClause} GROUP BY "bucket" ORDER BY "bucket" ASC`,
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
