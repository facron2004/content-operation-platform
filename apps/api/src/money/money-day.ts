import { beijingDateKey, beijingDayRangeUtc } from '@content/shared';
import { SQL_GMV_OH } from '../common';
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
  const { start, end } = beijingDayRangeUtc(date);
  const [row] = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE "paidTime" >= ? AND "paidTime" < ?`,
    start.toISOString(),
    end.toISOString()
  )) as Array<{ totalGmv: number; paidOrderCount: number }>;

  return {
    date,
    totalGmv: Number(row?.totalGmv ?? 0),
    paidOrderCount: Number(row?.paidOrderCount ?? 0),
    dataSource: 'OrderHeader'
  };
}

/** DailyMetrics row as money day totals when present. */
export async function loadDayGmvFromDailyMetrics(
  prisma: Pick<MoneyPrisma, 'dailyMetrics'>,
  date: string
): Promise<MoneyDayTotals | null> {
  const dm = await prisma.dailyMetrics.findUnique({ where: { date } });
  if (!dm) return null;
  return {
    date,
    totalGmv: Number(dm.totalGmv),
    paidOrderCount: Number(dm.paidOrderCount),
    dataSource: 'DailyMetrics'
  };
}
