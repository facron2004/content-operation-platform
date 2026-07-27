/** GMV OrderHeader raw SQL queries (aggregates / hourly / distribution loaders). */
import { SQL_GMV_OH, sqlBeijingDate, sqlDatetimeExclusiveRange } from '../common';
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
    `SELECT COALESCE(SUM("paidAmount"), 0) AS "paidAmount",
            COALESCE(SUM("paidAmountWallet"), 0) AS "paidAmountWallet",
            COALESCE(SUM("paidAmountBonus"), 0) AS "paidAmountBonus",
            COALESCE(SUM("paidAmountCard"), 0) AS "paidAmountCard",
            COALESCE(SUM("verifyAmount"), 0) AS "verifyAmount",
            COUNT(*) AS "orderCount"
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
): Promise<Array<{ totalRefund: number }>> {
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("refundAmount"), 0) AS "totalRefund"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"refundTime"')} AND "refundAmount" > 0`,
    startBound,
    endBound
  )) as Array<{ totalRefund: number }>;
}

export async function queryOrderHeaderHourly(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<GmvHourlyPoint[]> {
  const paidDt = `datetime(replace(replace("paidTime", 'T', ' '), 'Z', ''))`;
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT CAST(strftime('%H', datetime(${paidDt}, '+8 hours')) AS INTEGER) AS "hour",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}
     GROUP BY strftime('%H', datetime(${paidDt}, '+8 hours'))
     ORDER BY "hour" ASC`,
    startBound,
    endBound
  )) as Array<{ hour: number; totalGmv: number; paidOrderCount: number }>;

  const base = emptyHourlyPoints();
  for (const row of rows) {
    const hour = Number(row.hour);
    if (hour >= 0 && hour <= 23) {
      base[hour] = {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        totalGmv: Number(row.totalGmv),
        paidOrderCount: Number(row.paidOrderCount)
      };
    }
  }
  return base;
}

export type DistSqlRow = {
  key: string;
  gmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
};

export async function loadOrderHeaderAreaDistribution(
  prisma: PrismaLike,
  startBound: string,
  endBound: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalGmv: number }>;
  const totalGmv = Number(totalRow[0]?.totalGmv ?? 0);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(
              NULLIF(oh."areaName", ''),
              NULLIF(cp."areaName", ''),
              '未分区'
            ) AS "key",
            COALESCE(SUM(oh."paidAmount" + oh."paidAmountWallet"), 0) AS "gmv",
            COALESCE(SUM(oh."paidAmount"), 0) AS "gmvOnline",
            COALESCE(SUM(oh."paidAmountWallet"), 0) AS "gmvWallet",
            COALESCE(SUM(oh."paidAmountBonus"), 0) AS "gmvBonus"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY COALESCE(NULLIF(oh."areaName", ''), NULLIF(cp."areaName", ''), '未分区')
     ORDER BY "gmv" DESC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as DistSqlRow[];

  const meaningful = rows.filter((r) => r.key && r.key !== '未分区');
  if (meaningful.length === 0) {
    const merchantRows = (await prisma.$queryRawUnsafe(
      `SELECT COALESCE(NULLIF(oh."merchantName", ''), '未知商家') AS "key",
              COALESCE(SUM(oh."paidAmount" + oh."paidAmountWallet"), 0) AS "gmv",
              COALESCE(SUM(oh."paidAmount"), 0) AS "gmvOnline",
              COALESCE(SUM(oh."paidAmountWallet"), 0) AS "gmvWallet",
              COALESCE(SUM(oh."paidAmountBonus"), 0) AS "gmvBonus"
       FROM "OrderHeader" oh
       WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
       GROUP BY COALESCE(NULLIF(oh."merchantName", ''), '未知商家')
       ORDER BY "gmv" DESC
       LIMIT ?`,
      startBound,
      endBound,
      limit
    )) as DistSqlRow[];
    return { totalGmv, rows: merchantRows, dimLabel: 'merchant' as const };
  }

  return { totalGmv, rows, dimLabel: 'area' as const };
}

export async function loadOrderHeaderCategoryDistribution(
  prisma: PrismaLike,
  startBound: string,
  endBound: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalGmv: number }>;
  const totalGmv = Number(totalRow[0]?.totalGmv ?? 0);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(cp."category", ''), '未分类') AS "key",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv",
            COALESCE(SUM(oh."paidAmount"), 0) AS "gmvOnline",
            COALESCE(SUM(oh."paidAmountWallet"), 0) AS "gmvWallet",
            COALESCE(SUM(oh."paidAmountBonus"), 0) AS "gmvBonus"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY COALESCE(NULLIF(cp."category", ''), '未分类')
     ORDER BY "gmv" DESC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as DistSqlRow[];

  return { totalGmv, rows };
}

export type TrendAggRow = {
  date: string;
  paidAmount: number;
  paidAmountWallet: number;
  paidAmountBonus: number;
  refundAmount: number;
  verifyAmount: number;
  orderCount: number;
};

export async function queryOrderHeaderTrendAgg(
  prisma: PrismaLike,
  startBound: string,
  endBound: string
): Promise<TrendAggRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT ${sqlBeijingDate('"paidTime"')} AS "date",
            COALESCE(SUM("paidAmount"), 0) AS "paidAmount",
            COALESCE(SUM("paidAmountWallet"), 0) AS "paidAmountWallet",
            COALESCE(SUM("paidAmountBonus"), 0) AS "paidAmountBonus",
            COALESCE(SUM("refundAmount"), 0) AS "refundAmount",
            COALESCE(SUM("verifyAmount"), 0) AS "verifyAmount",
            COUNT(*) AS "orderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} AND "paidTime" IS NOT NULL
     GROUP BY ${sqlBeijingDate('"paidTime"')}
     ORDER BY "date" ASC`,
    startBound,
    endBound
  )) as TrendAggRow[];
}
