import { beijingDayRangeUtc, shiftDateKey } from '@content/shared';
import { SQL_GMV_OH } from '../common';
import type { PrismaService } from '../prisma/prisma.service';
import type { OverviewTrendPoint } from './overview.types';

export async function loadTrendRows(
  prisma: PrismaService,
  startDate: string,
  end: string
): Promise<OverviewTrendPoint[]> {
  const { start } = beijingDayRangeUtc(startDate);
  const { end: endExclusive } = beijingDayRangeUtc(end);
  const salesRows = (await prisma.$queryRawUnsafe(
    `SELECT date(datetime("paidTime", '+8 hours')) AS "date",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE "paidTime" >= ? AND "paidTime" < ?
     GROUP BY date(datetime("paidTime", '+8 hours'))
     ORDER BY "date" ASC`,
    start.toISOString(),
    endExclusive.toISOString()
  )) as Array<{ date: string; gmv: number; paidOrderCount: number }>;

  const byDate = new Map(salesRows.map((r) => [r.date, r]));
  const days =
    Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000) +
    1;
  const result: OverviewTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(startDate, i);
    const row = byDate.get(d);
    result.push({
      date: d,
      gmv: Number(row?.gmv ?? 0),
      paidOrderCount: Number(row?.paidOrderCount ?? 0)
    });
  }
  return result;
}
