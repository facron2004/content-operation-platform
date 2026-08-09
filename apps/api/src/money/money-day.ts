import { beijingDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  SQL_GMV_OH,
  sqlDatetimeExclusiveRange,
  toFenBigInt
} from '../common';
import type { MoneyDayTotals, MoneyPrisma } from './money.types';

/** True when `date` is the current Beijing calendar day. */
export function isBeijingToday(date: string, now = new Date()): boolean {
  return date === beijingDateKey(now);
}

/** OrderHeader paid GMV + order count for one Beijing day. Always dataSource OrderHeader. */
export async function loadDayGmvFromOrderHeader(
  prisma: Pick<MoneyPrisma, '$queryRawUnsafe'>,
  date: string
): Promise<MoneyDayTotals> {
  const { start, end } = beijingDayRangeSqlite(date);
  const [row] = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    start,
    end
  )) as Array<{ totalGmvFen: bigint | number | null; paidOrderCount: number }>;

  return {
    date,
    totalGmvFen: toFenBigInt(row?.totalGmvFen),
    paidOrderCount: Number(row?.paidOrderCount ?? 0),
    dataSource: 'OrderHeader'
  };
}

/** DailyMetrics row as net money day totals when present. Its stored total is gross. */
export async function loadDayGmvFromDailyMetrics(
  prisma: Pick<MoneyPrisma, 'dailyMetrics'>,
  date: string
): Promise<MoneyDayTotals | null> {
  const dm = await prisma.dailyMetrics.findUnique({
    where: { date },
    select: { totalGmvFen: true, totalRefundFen: true, paidOrderCount: true }
  });
  if (!dm) return null;
  const totalGmvFen =
    dm.totalGmvFen == null ? null : BigInt(dm.totalGmvFen) - BigInt(dm.totalRefundFen ?? 0);
  return {
    date,
    totalGmvFen,
    paidOrderCount: Number(dm.paidOrderCount),
    dataSource: 'DailyMetrics'
  };
}
