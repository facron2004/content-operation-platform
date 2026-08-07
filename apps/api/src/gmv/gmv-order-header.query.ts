/** GMV OrderHeader raw SQL queries (aggregates / hourly / distribution loaders). */
import { SQL_GMV_OH, sqlBeijingDate, sqlDatetimeExclusiveRange, toFenBigInt } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { emptyHourlyPoints, type GmvHourlyPoint } from './gmv.dto';
import { type OrderHeaderGmvRow } from './gmv-order-header.types';

type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

export async function queryOrderHeaderGmv(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<OrderHeaderGmvRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("paidAmountFen"), 0) AS "paidAmountFen",
            COALESCE(SUM("paidAmountWalletFen"), 0) AS "paidAmountWalletFen",
            COALESCE(SUM("paidAmountBonusFen"), 0) AS "paidAmountBonusFen",
            COALESCE(SUM("paidAmountCardFen"), 0) AS "paidAmountCardFen",
            COALESCE(SUM("verifyAmountFen"), 0) AS "verifyAmountFen",
            COALESCE(SUM("refundAmountFen"), 0) AS "refundAmountFen",
            COUNT(*) AS "orderCount",
            COUNT(CASE WHEN "refundAmountFen" > 0 THEN 1 END) AS "refundOrderCount",
            COUNT(CASE WHEN "verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as OrderHeaderGmvRow[];
}

export async function queryOrderHeaderRefund(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<Array<{ totalRefundFen: bigint | null; refundOrderCount: number }>> {
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("refundAmountFen"), 0) AS "totalRefundFen",
            COUNT(*) AS "refundOrderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} AND "refundAmountFen" > 0`,
    startBound,
    endBound
  )) as Array<{ totalRefundFen: bigint | null; refundOrderCount: number }>;
}

export async function queryOrderHeaderHourly(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<GmvHourlyPoint[]> {
  const paidDt = `datetime(replace(replace("paidTime", 'T', ' '), 'Z', ''))`;
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT CAST(strftime('%H', datetime(${paidDt}, '+8 hours')) AS INTEGER) AS "hour",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}
     GROUP BY strftime('%H', datetime(${paidDt}, '+8 hours'))
     ORDER BY "hour" ASC`,
    startBound,
    endBound
  )) as Array<{ hour: number; totalGmvFen: bigint | null; paidOrderCount: number }>;

  const base = emptyHourlyPoints();
  for (const row of rows) {
    const hour = Number(row.hour);
    if (hour >= 0 && hour <= 23) {
      base[hour] = {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        totalGmvFen: toFenBigInt(row.totalGmvFen),
        paidOrderCount: Number(row.paidOrderCount)
      };
    }
  }
  return base;
}

export type DistSqlRow = {
  key: string;
  gmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  refundFen: bigint | null;
};

export async function loadOrderHeaderAreaDistribution(
  prisma: PrismaLike,
  startBound: string,
  endBound: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalGmvFen: bigint | null }>;
  const totalGmvFen = toFenBigInt(totalRow[0]?.totalGmvFen);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(
              NULLIF(oh."areaName", ''),
              NULLIF(cp."areaName", ''),
              '未分区'
            ) AS "key",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen",
            COALESCE(SUM(oh."paidAmountFen"), 0) AS "gmvOnlineFen",
            COALESCE(SUM(oh."paidAmountWalletFen"), 0) AS "gmvWalletFen",
            COALESCE(SUM(oh."paidAmountBonusFen"), 0) AS "gmvBonusFen",
            COALESCE(SUM(oh."refundAmountFen"), 0) AS "refundFen"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY COALESCE(NULLIF(oh."areaName", ''), NULLIF(cp."areaName", ''), '未分区')
     ORDER BY "gmvFen" DESC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as DistSqlRow[];

  const meaningful = rows.filter((r) => r.key && r.key !== '未分区');
  if (meaningful.length === 0) {
    const merchantRows = (await prisma.$queryRawUnsafe(
      `SELECT COALESCE(NULLIF(oh."merchantName", ''), '未知商家') AS "key",
              COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen",
              COALESCE(SUM(oh."paidAmountFen"), 0) AS "gmvOnlineFen",
              COALESCE(SUM(oh."paidAmountWalletFen"), 0) AS "gmvWalletFen",
              COALESCE(SUM(oh."paidAmountBonusFen"), 0) AS "gmvBonusFen",
              COALESCE(SUM(oh."refundAmountFen"), 0) AS "refundFen"
       FROM "OrderHeader" oh
       WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
       GROUP BY COALESCE(NULLIF(oh."merchantName", ''), '未知商家')
       ORDER BY "gmvFen" DESC
       LIMIT ?`,
      startBound,
      endBound,
      limit
    )) as DistSqlRow[];
    return { totalGmvFen, rows: merchantRows, dimLabel: 'merchant' as const };
  }

  return { totalGmvFen, rows, dimLabel: 'area' as const };
}

export async function loadOrderHeaderCategoryDistribution(
  prisma: PrismaLike,
  startBound: string,
  endBound: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalGmvFen: bigint | null }>;
  const totalGmvFen = toFenBigInt(totalRow[0]?.totalGmvFen);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(cp."category", ''), '未分类') AS "key",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen",
            COALESCE(SUM(oh."paidAmountFen"), 0) AS "gmvOnlineFen",
            COALESCE(SUM(oh."paidAmountWalletFen"), 0) AS "gmvWalletFen",
            COALESCE(SUM(oh."paidAmountBonusFen"), 0) AS "gmvBonusFen",
            COALESCE(SUM(oh."refundAmountFen"), 0) AS "refundFen"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY COALESCE(NULLIF(cp."category", ''), '未分类')
     ORDER BY "gmvFen" DESC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as DistSqlRow[];

  return { totalGmvFen, rows };
}

export type TrendAggRow = {
  date: string;
  paidAmountFen: bigint | null;
  paidAmountWalletFen: bigint | null;
  paidAmountBonusFen: bigint | null;
  refundAmountFen: bigint | null;
  verifyAmountFen: bigint | null;
  orderCount: number;
  refundOrderCount: number;
  verifyCount: number;
};

export async function queryOrderHeaderTrendAgg(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<TrendAggRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT ${sqlBeijingDate('"paidTime"')} AS "date",
            COALESCE(SUM("paidAmountFen"), 0) AS "paidAmountFen",
            COALESCE(SUM("paidAmountWalletFen"), 0) AS "paidAmountWalletFen",
            COALESCE(SUM("paidAmountBonusFen"), 0) AS "paidAmountBonusFen",
            COALESCE(SUM("refundAmountFen"), 0) AS "refundAmountFen",
            COALESCE(SUM("verifyAmountFen"), 0) AS "verifyAmountFen",
            COUNT(*) AS "orderCount",
            COUNT(CASE WHEN "refundAmountFen" > 0 THEN 1 END) AS "refundOrderCount",
            COUNT(CASE WHEN "verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} AND "paidTime" IS NOT NULL
     GROUP BY ${sqlBeijingDate('"paidTime"')}
     ORDER BY "date" ASC`,
    startBound,
    endBound
  )) as TrendAggRow[];
}
