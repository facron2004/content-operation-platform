/** Timeline queries for zero-sales SKU detail views. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';

export async function loadSkuTimelineSeries(
  prisma: PrismaService,
  packageId: string,
  start: string,
  today: string,
  days: number
) {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "snapshotDate" AS "date", "remainingStock" AS "stockLeft" FROM "JeeSiteInventoryDailySnapshot" WHERE "packageId" = ? AND "snapshotDate" >= ? AND "snapshotDate" <= ? ORDER BY "snapshotDate" ASC`,
    packageId,
    start,
    today
  )) as Array<{ date: string; stockLeft: number }>;
  const sales = (await prisma.$queryRawUnsafe(
    `SELECT "date", "salesQty", COALESCE("deltaSource", 'legacy') AS "deltaSource" FROM "PackageSalesDaily" WHERE "packageId" = ? AND "date" >= ? AND "date" <= ? ORDER BY "date" ASC`,
    packageId,
    start,
    today
  )) as Array<{ date: string; salesQty: number; deltaSource: string }>;
  const salesByDate = new Map(sales.map((s) => [s.date, s])),
    stockByDate = new Map(rows.map((r) => [r.date, r.stockLeft]));
  const timeline: Array<{
    date: string;
    stockLeft: number;
    salesQty: number;
    deltaSource: string;
  }> = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      s = salesByDate.get(d);
    timeline.push({
      date: d,
      stockLeft: Number(stockByDate.get(d) ?? 0),
      salesQty: Number(s?.salesQty ?? 0),
      deltaSource: s?.deltaSource ?? 'no_data'
    });
  }
  return timeline;
}

export async function loadSkuTimeline(prisma: PrismaService, packageId: string, days: number) {
  const today = beijingDateKey(new Date());
  const start = shiftDateKey(today, -(days - 1));
  const timeline = await loadSkuTimelineSeries(prisma, packageId, start, today, days);
  return { packageId, days, timeline };
}
