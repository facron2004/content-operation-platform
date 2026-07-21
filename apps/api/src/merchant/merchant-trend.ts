import { beijingDateKey, shiftDateKey } from '@content/shared';
import type { PrismaService } from '../prisma/prisma.service';

export type MerchantTrendRow = {
  date: string;
  gmv: number;
  paidOrderCount: number;
  orderCount: number;
  exposureCount: number;
  clickCount: number;
};

export async function loadMerchantTrendRows(
  prisma: PrismaService,
  merchantId: string,
  start: string,
  today: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT date(datetime(ss."snapshotTime" / 1000, 'unixepoch', '+8 hours')) AS "date", COALESCE(SUM(ss."gmv"), 0) AS "gmv", COALESCE(SUM(ss."paidOrderCount"), 0) AS "paidOrderCount", COALESCE(SUM(ss."orderCount"), 0) AS "orderCount", COALESCE(SUM(ss."exposureCount"), 0) AS "exposureCount", COALESCE(SUM(ss."clickCount"), 0) AS "clickCount" FROM "SalesSnapshot" ss JOIN "ContentPackage" cp ON cp."packageId" = ss."packageId" WHERE cp."merchantId" = ? AND date(datetime(ss."snapshotTime" / 1000, 'unixepoch', '+8 hours')) >= ? AND date(datetime(ss."snapshotTime" / 1000, 'unixepoch', '+8 hours')) <= ? GROUP BY date(datetime(ss."snapshotTime" / 1000, 'unixepoch', '+8 hours')) ORDER BY "date" ASC`,
    merchantId,
    start,
    today
  )) as Array<{
    date: string;
    gmv: number;
    paidOrderCount: number;
    orderCount: number;
    exposureCount: number;
    clickCount: number;
  }>;
}

export function fillMerchantTrend(rows: MerchantTrendRow[], start: string, days: number) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const trend: Array<MerchantTrendRow & { conversionRate: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i);
    const r = byDate.get(d);
    const exposure = Number(r?.exposureCount ?? 0);
    const click = Number(r?.clickCount ?? 0);
    const order = Number(r?.orderCount ?? 0);
    trend.push({
      date: d,
      gmv: Number(r?.gmv ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0),
      orderCount: order,
      exposureCount: exposure,
      clickCount: click,
      conversionRate: click > 0 ? order / click : 0
    });
  }
  return trend;
}

export async function loadMerchantTrendPayload(
  prisma: PrismaService,
  merchantId: string,
  days: number
) {
  const today = beijingDateKey(new Date());
  const start = shiftDateKey(today, -(days - 1));
  const rows = await loadMerchantTrendRows(prisma, merchantId, start, today);
  return { merchantId, days, trend: fillMerchantTrend(rows, start, days) };
}
