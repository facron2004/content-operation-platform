import { shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  SQL_GMV_OH,
  sqlBeijingDate,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common';

export type DailyMetricsRecomputePrisma = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $transaction?: <T>(fn: (tx: DailyMetricsRecomputePrisma) => Promise<T>) => Promise<T>;
};

/**
 * Range recompute of DailyMetrics from OrderHeader (Beijing day on paidTime).
 * Online path: delete only [startDate, endDate], then upsert aggregates.
 * Never truncates the whole table.
 * Delete+insert run in one transaction so a mid-refresh crash cannot leave
 * an empty KPI window for the range.
 *
 * WHERE paidTime uses exclusive half-open bounds (index-friendly); sqlBeijingDate
 * only for SELECT/GROUP BY day keys.
 */
export async function recomputeDailyMetricsRange(
  prisma: DailyMetricsRecomputePrisma,
  startDate: string,
  endDate: string
): Promise<{ startDate: string; endDate: string; rowsAffected: number }> {
  if (startDate > endDate) {
    throw new Error(`recomputeDailyMetricsRange: startDate ${startDate} > endDate ${endDate}`);
  }

  const paidStart = beijingDayRangeSqlite(startDate).start;
  const paidEnd = beijingDayRangeSqlite(endDate).end;

  const run = async (tx: DailyMetricsRecomputePrisma) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM "DailyMetrics" WHERE "date" >= ? AND "date" <= ?`,
      startDate,
      endDate
    );

    const now = toSqliteDateTime();
    return tx.$executeRawUnsafe(
      `
      INSERT OR REPLACE INTO "DailyMetrics" (
        "date", "totalGmv", "gmvOnline", "gmvWallet", "gmvBonus", "gmvCard",
        "totalRefund", "totalVerify", "totalOrders", "paidOrderCount",
        "verifyCount", "refundCount", "activeMerchants",
        "refundRate", "verifyRate",
        "updatedAt"
      )
      SELECT
        ${sqlBeijingDate('oh."paidTime"')} AS "date",
        COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv",
        COALESCE(SUM(oh."paidAmount"), 0) AS "gmvOnline",
        COALESCE(SUM(oh."paidAmountWallet"), 0) AS "gmvWallet",
        COALESCE(SUM(oh."paidAmountBonus"), 0) AS "gmvBonus",
        COALESCE(SUM(oh."paidAmountCard"), 0) AS "gmvCard",
        COALESCE(SUM(oh."refundAmount"), 0) AS "totalRefund",
        COALESCE(SUM(oh."verifyAmount"), 0) AS "totalVerify",
        COUNT(*) AS "totalOrders",
        COUNT(*) AS "paidOrderCount",
        SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN 1 ELSE 0 END) AS "verifyCount",
        SUM(CASE WHEN oh."refundAmount" > 0 THEN 1 ELSE 0 END) AS "refundCount",
        COUNT(DISTINCT oh."merchantId") AS "activeMerchants",
        CASE
          WHEN COALESCE(SUM(${SQL_GMV_OH}), 0) > 0
          THEN COALESCE(SUM(oh."refundAmount"), 0) * 1.0 / SUM(${SQL_GMV_OH})
          ELSE 0
        END AS "refundRate",
        CASE
          WHEN COALESCE(SUM(${SQL_GMV_OH}), 0) > 0
          THEN COALESCE(SUM(oh."verifyAmount"), 0) * 1.0 / SUM(${SQL_GMV_OH})
          ELSE 0
        END AS "verifyRate",
        ? AS "updatedAt"
      FROM "OrderHeader" oh
      WHERE oh."paidTime" IS NOT NULL
        AND ${sqlDatetimeExclusiveRange('oh."paidTime"')}
      GROUP BY ${sqlBeijingDate('oh."paidTime"')}
    `,
      now,
      paidStart,
      paidEnd
    );
  };

  const inserted = prisma.$transaction
    ? await prisma.$transaction((tx) => run(tx))
    : await run(prisma);

  return {
    startDate,
    endDate,
    rowsAffected: Number(inserted ?? 0)
  };
}

/** Recompute last N Beijing days ending at endDate (inclusive). */
export async function recomputeDailyMetricsLastDays(
  prisma: DailyMetricsRecomputePrisma,
  endDate: string,
  days: number
) {
  const startDate = shiftDateKey(endDate, -(Math.max(1, days) - 1));
  return recomputeDailyMetricsRange(prisma, startDate, endDate);
}
