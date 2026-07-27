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

/**
 * Merchant money trend from MerchantDailyMetrics (live GMV truth).
 * SalesSnapshot is no longer written by the durable money stack — reading it
 * returned empty/wrong GMV. MDM is date-indexed and retained 180d.
 *
 * merchantId may be either Merchant.merchantId or a merchantName (list/export
 * paths often key by name). Match both via Merchant join OR direct name.
 * Exposure/click are not in MDM — zero-filled for API shape compatibility.
 */
export async function loadMerchantTrendRows(
  prisma: PrismaService,
  merchantId: string,
  start: string,
  today: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT mdm."date" AS "date",
            COALESCE(SUM(mdm."paidAmountOnline" + mdm."paidAmountWallet"), 0) AS "gmv",
            COALESCE(SUM(mdm."paidOrderCount"), 0) AS "paidOrderCount",
            COALESCE(SUM(mdm."orderCount"), 0) AS "orderCount",
            0 AS "exposureCount",
            0 AS "clickCount"
     FROM "MerchantDailyMetrics" mdm
     WHERE mdm."date" >= ? AND mdm."date" <= ?
       AND (
         mdm."merchantName" = ?
         OR mdm."merchantName" IN (
           SELECT m."merchantName" FROM "Merchant" m WHERE m."merchantId" = ? LIMIT 1
         )
       )
     GROUP BY mdm."date"
     ORDER BY mdm."date" ASC`,
    start,
    today,
    merchantId,
    merchantId
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
