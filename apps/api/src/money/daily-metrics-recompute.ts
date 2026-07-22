import { shiftDateKey } from '@content/shared';
import { SQL_GMV_OH } from '../common';

export type DailyMetricsRecomputePrisma = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

/**
 * Range recompute of DailyMetrics from OrderHeader (Beijing day on paidTime).
 * Online path: delete only [startDate, endDate], then upsert aggregates.
 * Never truncates the whole table.
 */
export async function recomputeDailyMetricsRange(
  prisma: DailyMetricsRecomputePrisma,
  startDate: string,
  endDate: string
): Promise<{ startDate: string; endDate: string; rowsAffected: number }> {
  if (startDate > endDate) {
    throw new Error(`recomputeDailyMetricsRange: startDate ${startDate} > endDate ${endDate}`);
  }

  await prisma.$executeRawUnsafe(
    `DELETE FROM "DailyMetrics" WHERE "date" >= ? AND "date" <= ?`,
    startDate,
    endDate
  );

  const inserted = await prisma.$executeRawUnsafe(
    `
      INSERT OR REPLACE INTO "DailyMetrics" (
        "date", "totalGmv", "gmvOnline", "gmvWallet", "gmvBonus", "gmvCard",
        "totalRefund", "totalVerify", "totalOrders", "paidOrderCount",
        "verifyCount", "refundCount", "activeMerchants",
        "refundRate", "verifyRate",
        "updatedAt"
      )
      SELECT
        date(datetime(oh."paidTime", '+8 hours')) AS "date",
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
        CURRENT_TIMESTAMP AS "updatedAt"
      FROM "OrderHeader" oh
      WHERE oh."paidTime" IS NOT NULL
        AND date(datetime(oh."paidTime", '+8 hours')) >= ?
        AND date(datetime(oh."paidTime", '+8 hours')) <= ?
      GROUP BY date(datetime(oh."paidTime", '+8 hours'))
    `,
    startDate,
    endDate
  );

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
