import { shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  SQL_GMV_OH,
  sqlBeijingDate,
  sqlDatetimeExclusiveRange,
  toFenBigInt
} from '../common';
import type { PrismaService } from '../prisma/prisma.service';
import type { OverviewTrendPoint } from './overview.types';

export async function loadTrendRows(
  prisma: PrismaService,
  startDate: string,
  end: string
): Promise<OverviewTrendPoint[]> {
  const { start } = beijingDayRangeSqlite(startDate);
  const { end: endExclusive } = beijingDayRangeSqlite(end);
  const salesRows = (await prisma.$queryRawUnsafe(
    `SELECT ${sqlBeijingDate('"paidTime"')} AS "date",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}
     GROUP BY ${sqlBeijingDate('"paidTime"')}
     ORDER BY "date" ASC`,
    start,
    endExclusive
  )) as Array<{ date: string; gmvFen: bigint | number | null; paidOrderCount: number }>;

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
      gmvFen: toFenBigInt(row?.gmvFen ?? 0),
      paidOrderCount: Number(row?.paidOrderCount ?? 0)
    });
  }
  return result;
}
