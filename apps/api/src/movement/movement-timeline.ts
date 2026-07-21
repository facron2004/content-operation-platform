import type { PrismaService } from '../prisma/prisma.service';
import { shiftDateKey } from '@content/shared';
import type { MovementTimelinePoint, MovementTimelineResponse } from './movement.types';

export async function loadTimelineStockRows(
  prisma: PrismaService,
  packageId: string,
  start: string,
  today: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT "snapshotDate" AS "date", "remainingStock" AS "stockLeft" FROM "JeeSiteInventoryDailySnapshot" WHERE "packageId" = ? AND "snapshotDate" >= ? AND "snapshotDate" <= ? ORDER BY "snapshotDate" ASC`,
    packageId,
    start,
    today
  )) as Array<{ date: string; stockLeft: number }>;
}

export async function loadTimelineSalesRows(
  prisma: PrismaService,
  packageId: string,
  start: string,
  today: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT "date", "salesQty", COALESCE("deltaSource", 'legacy') AS "deltaSource" FROM "PackageSalesDaily" WHERE "packageId" = ? AND "date" >= ? AND "date" <= ? ORDER BY "date" ASC`,
    packageId,
    start,
    today
  )) as Array<{ date: string; salesQty: number; deltaSource: string }>;
}

export async function buildMovementTimeline(
  prisma: PrismaService,
  packageId: string,
  days: number,
  today: string
): Promise<MovementTimelineResponse> {
  const start = shiftDateKey(today, -(days - 1));
  const [stockRows, salesRows] = await Promise.all([
    loadTimelineStockRows(prisma, packageId, start, today),
    loadTimelineSalesRows(prisma, packageId, start, today)
  ]);
  const stockMap = new Map(stockRows.map((r) => [r.date, r.stockLeft]));
  const salesMap = new Map(salesRows.map((r) => [r.date, r]));
  const timeline: MovementTimelinePoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i);
    const s = salesMap.get(d);
    timeline.push({
      date: d,
      stockLeft: Number(stockMap.get(d) ?? 0),
      salesQty: Number(s?.salesQty ?? 0),
      deltaSource: s?.deltaSource ?? 'no_data'
    });
  }
  return { packageId, days, timeline };
}
