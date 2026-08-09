/** Trend, time-slot, and hourly aggregates for the 砍价订单 data-analysis report. */
import { shiftDateKey } from '@content/shared';
import {
  type DataAnalysisDailyPoint,
  type DataAnalysisHourlyRow,
  type DataAnalysisTimeSlotRow
} from './data-analysis.dto';
import { paidTimeBounds } from './data-analysis-window';
import {
  IS_VERIFIED,
  PAID_WHERE,
  type PrismaLike,
  REFUND_COMPONENTS_FEN,
  n,
  rate
} from './data-analysis-query.shared';

const BEIJING_HOUR = `CAST(strftime('%H', datetime(replace(replace("paidTime", 'T', ' '), 'Z', ''), '+8 hours')) AS INTEGER)`;
/** Beijing calendar date from paidTime (space or ISO form). */
const BEIJING_DATE = `date(datetime(replace(replace("paidTime", 'T', ' '), 'Z', ''), '+8 hours'))`;

const TIME_SLOTS: Array<{ label: string; startH: number; endH: number }> = [
  { label: '凌晨 0-6', startH: 0, endH: 6 },
  { label: '早间 6-9', startH: 6, endH: 9 },
  { label: '上午 9-12', startH: 9, endH: 12 },
  { label: '午间 12-14', startH: 12, endH: 14 },
  { label: '下午 14-17', startH: 14, endH: 17 },
  { label: '傍晚 17-19', startH: 17, endH: 19 },
  { label: '晚间 19-22', startH: 19, endH: 22 },
  { label: '深夜 22-24', startH: 22, endH: 24 }
];

/** Daily series over [startDate, endDate] (inclusive), filled for missing days. */
export async function queryDailyTrend(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisDailyPoint[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `WITH base AS (
       SELECT
         ${BEIJING_DATE} AS "date",
         COUNT(*) AS "orderCount",
         COALESCE(SUM("paidAmountFen") / 100.0, 0) AS "salesAmount",
         COALESCE(SUM("paidAmountWalletFen") / 100.0, 0) AS "walletAmount",
         COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN "paidAmountFen" + "paidAmountWalletFen" ELSE 0 END) / 100.0, 0) AS "writeOffAmount"
       FROM "OrderHeader"
       WHERE ${PAID_WHERE}
       GROUP BY ${BEIJING_DATE}
     ),
     refundByDay AS (
       SELECT
         ${BEIJING_DATE} AS "date",
         COALESCE(SUM(${REFUND_COMPONENTS_FEN()}) / 100.0, 0) AS "refundAmount"
       FROM "OrderHeader"
       WHERE ${PAID_WHERE} AND "refundAmountFen" > 0
       GROUP BY ${BEIJING_DATE}
     ),
     alldates AS (
       SELECT "date" FROM base
       UNION
       SELECT "date" FROM refundByDay
     )
     SELECT
       a."date",
       COALESCE(b."orderCount", 0) AS "orderCount",
       COALESCE(b."salesAmount", 0) AS "salesAmount",
       COALESCE(b."walletAmount", 0) AS "walletAmount",
       COALESCE(b."writeOffAmount", 0) AS "writeOffAmount",
       COALESCE(r."refundAmount", 0) AS "refundAmount"
     FROM alldates a
     LEFT JOIN base b ON b."date" = a."date"
     LEFT JOIN refundByDay r ON r."date" = a."date"
     ORDER BY a."date" ASC`,
    startBound,
    endBound,
    startBound,
    endBound
  )) as Array<{
    date: string | null;
    orderCount: number | null;
    salesAmount: number | null;
    walletAmount: number | null;
    writeOffAmount: number | null;
    refundAmount: number | null;
  }>;

  const byDate = new Map<string, DataAnalysisDailyPoint>();
  for (const row of rows) {
    const date = String(row.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const salesAmount = n(row.salesAmount);
    const walletAmount = n(row.walletAmount);
    const refundAmount = n(row.refundAmount);
    byDate.set(date, {
      date,
      salesAmount,
      tradeAmount: salesAmount + walletAmount,
      netGmv: salesAmount + walletAmount - refundAmount,
      writeOffAmount: n(row.writeOffAmount),
      orderCount: n(row.orderCount),
      refundAmount
    });
  }

  // Fill every day so the line chart axis is continuous.
  const points: DataAnalysisDailyPoint[] = [];
  let cursor = startDate;
  // Guard against pathological spans (service already caps at 90d).
  for (let i = 0; i < 120; i++) {
    const hit = byDate.get(cursor);
    points.push(
      hit ?? {
        date: cursor,
        salesAmount: 0,
        tradeAmount: 0,
        netGmv: 0,
        writeOffAmount: 0,
        orderCount: 0,
        refundAmount: 0
      }
    );
    if (cursor === endDate) break;
    cursor = shiftDateKey(cursor, 1);
    if (cursor > endDate) break;
  }
  return points;
}

export async function queryTimeSlots(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisTimeSlotRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${BEIJING_HOUR} AS "hour",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmountFen") / 100.0, 0) AS "salesAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}
     GROUP BY ${BEIJING_HOUR}`,
    startBound,
    endBound
  )) as Array<{
    hour: number | null;
    orderCount: number | null;
    salesAmount: number | null;
    verifiedCount: number | null;
  }>;

  const byHour = new Map<
    number,
    { orderCount: number; salesAmount: number; verifiedCount: number }
  >();
  for (const row of rows) {
    const hour = n(row.hour);
    if (hour < 0 || hour > 23) continue;
    byHour.set(hour, {
      orderCount: n(row.orderCount),
      salesAmount: n(row.salesAmount),
      verifiedCount: n(row.verifiedCount)
    });
  }

  return TIME_SLOTS.map((slot) => {
    let orderCount = 0;
    let salesAmount = 0;
    let verifiedCount = 0;
    for (let h = slot.startH; h < slot.endH; h++) {
      const cell = byHour.get(h);
      if (!cell) continue;
      orderCount += cell.orderCount;
      salesAmount += cell.salesAmount;
      verifiedCount += cell.verifiedCount;
    }
    return {
      label: slot.label,
      orderCount,
      salesAmount,
      verifiedCount,
      verifyRate: rate(verifiedCount, orderCount)
    };
  });
}

export async function queryHourly(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisHourlyRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${BEIJING_HOUR} AS "hour",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmountFen") / 100.0, 0) AS "salesAmount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}
     GROUP BY ${BEIJING_HOUR}
     HAVING COUNT(*) > 0
     ORDER BY "hour" ASC`,
    startBound,
    endBound
  )) as Array<{ hour: number | null; orderCount: number | null; salesAmount: number | null }>;

  return rows
    .map((r) => ({
      hour: n(r.hour),
      orderCount: n(r.orderCount),
      salesAmount: n(r.salesAmount)
    }))
    .filter((r) => r.hour >= 0 && r.hour <= 23);
}
