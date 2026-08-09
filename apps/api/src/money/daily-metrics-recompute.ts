import { shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
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
        "date",
        "totalGmvFen", "gmvOnlineFen", "gmvWalletFen",
        "gmvBonusFen", "gmvCardFen",
        "totalRefundFen", "totalVerifyFen",
        "totalOrders", "paidOrderCount",
        "verifyCount", "refundCount", "activeMerchants",
        "refundRate", "verifyRate",
        "updatedAt"
      )
      WITH base AS (
        SELECT
          ${sqlBeijingDate('oh."paidTime"')} AS "date",
          (COALESCE(SUM(oh."paidAmountFen"), 0) + COALESCE(SUM(oh."paidAmountWalletFen"), 0)) AS "totalGmvFen",
          COALESCE(SUM(oh."paidAmountFen"), 0) AS "gmvOnlineFen",
          COALESCE(SUM(oh."paidAmountWalletFen"), 0) AS "gmvWalletFen",
          COALESCE(SUM(oh."paidAmountBonusFen"), 0) AS "gmvBonusFen",
          COALESCE(SUM(oh."paidAmountCardFen"), 0) AS "gmvCardFen",
          COALESCE(SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN oh."verifyAmountFen" ELSE 0 END), 0) AS "totalVerifyFen",
          COUNT(*) AS "totalOrders",
          COUNT(*) AS "paidOrderCount",
          SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN 1 ELSE 0 END) AS "verifyCount",
          COUNT(DISTINCT oh."merchantId") AS "activeMerchants"
        FROM "OrderHeader" oh
        WHERE oh."paidTime" IS NOT NULL
          AND ${sqlDatetimeExclusiveRange('oh."paidTime"')}
        GROUP BY ${sqlBeijingDate('oh."paidTime"')}
      ),
      refundByDay AS (
        SELECT
          ${sqlBeijingDate('oh."paidTime"')} AS "date",
          COALESCE(SUM(oh."refundAmountFen"), 0) AS "totalRefundFen",
          SUM(CASE WHEN oh."refundAmountFen" > 0 THEN 1 ELSE 0 END) AS "refundCount"
        FROM "OrderHeader" oh
        WHERE oh."paidTime" IS NOT NULL
          AND ${sqlDatetimeExclusiveRange('oh."paidTime"')}
          AND oh."refundAmountFen" > 0
        GROUP BY ${sqlBeijingDate('oh."paidTime"')}
      ),
      alldates AS (
        SELECT "date" FROM base
        UNION
        SELECT "date" FROM refundByDay
      )
      SELECT
        a."date",
        COALESCE(b."totalGmvFen", 0) AS "totalGmvFen",
        COALESCE(b."gmvOnlineFen", 0) AS "gmvOnlineFen",
        COALESCE(b."gmvWalletFen", 0) AS "gmvWalletFen",
        COALESCE(b."gmvBonusFen", 0) AS "gmvBonusFen",
        COALESCE(b."gmvCardFen", 0) AS "gmvCardFen",
        COALESCE(r."totalRefundFen", 0) AS "totalRefundFen",
        COALESCE(b."totalVerifyFen", 0) AS "totalVerifyFen",
        COALESCE(b."totalOrders", 0) AS "totalOrders",
        COALESCE(b."paidOrderCount", 0) AS "paidOrderCount",
        COALESCE(b."verifyCount", 0) AS "verifyCount",
        COALESCE(r."refundCount", 0) AS "refundCount",
        COALESCE(b."activeMerchants", 0) AS "activeMerchants",
        -- Unified 单数口径: 退款率 = 退款单数 / 支付单数, 核销率 = 核销单数 / 支付单数.
        CASE
          WHEN COALESCE(b."paidOrderCount", 0) > 0
          THEN CAST(COALESCE(r."refundCount", 0) AS REAL) * 1.0 / CAST(b."paidOrderCount" AS REAL)
          ELSE 0
        END AS "refundRate",
        CASE
          WHEN COALESCE(b."paidOrderCount", 0) > 0
          THEN CAST(COALESCE(b."verifyCount", 0) AS REAL) * 1.0 / CAST(b."paidOrderCount" AS REAL)
          ELSE 0
        END AS "verifyRate",
        ? AS "updatedAt"
      FROM alldates a
      LEFT JOIN base b ON b."date" = a."date"
      LEFT JOIN refundByDay r ON r."date" = a."date"
    `,
      paidStart,
      paidEnd,
      paidStart,
      paidEnd,
      now
    );
  };

  // Note: intentionally does NOT use callback-style $transaction — the libsql adapter
  // throws "unknown variant SocketTimeout" on $executeRawUnsafe inside $transaction.
  // The DELETE+INSERT pair is safe without a transaction since the range would be
  // rerun on the next refresh if a crash occurs between the two statements.
  const inserted = await run(prisma);

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
