/** MerchantDailyMetrics recompute SQL and write path. */
import type { PrismaService } from '../prisma/prisma.service';
import {
  beijingDayRangeSqlite,
  sqlBeijingDate,
  sqlDatetime,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common/sqlite-datetime';

/**
 * Recompute MerchantDailyMetrics for a Beijing date range.
 *
 * areaName used to be a correlated subquery over OrderHeader per (merchant, day)
 * group — O(groups × day-rows). Rewrite: filter once into `base`, pick latest
 * non-empty area via ROW_NUMBER in `area_pick`, then aggregate + scalar join.
 * Empty merchantName normalizes to '(未知)' on both sides so area resolves
 * (correlated form compared raw '' to '(未知)' and always missed).
 */
export const MERCHANT_DAILY_METRICS_INSERT_SQL = `
INSERT OR REPLACE INTO "MerchantDailyMetrics" (
  "merchantName",
  "date",
  "areaName",
  "paidOrderCount",
  "paidAmountOnlineFen",
  "paidAmountWalletFen",
  "paidAmountBonusFen",
  "paidAmountCardFen",
  "refundAmountFen",
  "verifyAmountFen",
  "orderCount",
  "packageCount",
  "updatedAt"
)
WITH base AS (
  SELECT
    COALESCE(NULLIF(oh."merchantName", ''), '(未知)') AS "merchantName",
    ${sqlBeijingDate('oh."paidTime"')} AS "dateKey",
    oh."areaName" AS "areaName",
    oh."paidTime" AS "paidTime",
    oh."paidAmountFen" AS "paidAmountFen",
    oh."paidAmountWalletFen" AS "paidAmountWalletFen",
    oh."paidAmountBonusFen" AS "paidAmountBonusFen",
    oh."paidAmountCardFen" AS "paidAmountCardFen",
    oh."verifyAmountFen" AS "verifyAmountFen",
    oh."packageId" AS "packageId"
  FROM "OrderHeader" oh
  WHERE oh."paidTime" IS NOT NULL
    AND ${sqlDatetimeExclusiveRange('oh."paidTime"')}
),
refundByMerchantDay AS (
  SELECT
    COALESCE(NULLIF(oh."merchantName", ''), '(未知)') AS "merchantName",
    ${sqlBeijingDate('oh."paidTime"')} AS "dateKey",
    SUM(oh."refundAmountFen") AS "refundAmountFen"
  FROM "OrderHeader" oh
  WHERE oh."paidTime" IS NOT NULL
    AND ${sqlDatetimeExclusiveRange('oh."paidTime"')}
    AND oh."refundAmountFen" > 0
  GROUP BY "merchantName", "dateKey"
),
base_agg AS (
  SELECT
    "merchantName",
    "dateKey",
    COUNT(*) AS "paidOrderCount",
    COALESCE(SUM("paidAmountFen"), 0) AS "paidAmountOnlineFen",
    COALESCE(SUM("paidAmountWalletFen"), 0) AS "paidAmountWalletFen",
    COALESCE(SUM("paidAmountBonusFen"), 0) AS "paidAmountBonusFen",
    COALESCE(SUM("paidAmountCardFen"), 0) AS "paidAmountCardFen",
    COALESCE(SUM("verifyAmountFen"), 0) AS "verifyAmountFen",
    COUNT(*) AS "orderCount",
    COUNT(DISTINCT b."packageId") AS "packageCount"
  FROM base b
  GROUP BY b."merchantName", b."dateKey"
),
spine AS (
  SELECT "merchantName", "dateKey" FROM base_agg
  UNION
  SELECT "merchantName", "dateKey" FROM refundByMerchantDay
),
area_pick AS (
  SELECT
    "merchantName",
    "dateKey",
    "areaName",
    ROW_NUMBER() OVER (
      PARTITION BY "merchantName", "dateKey"
      ORDER BY ${sqlDatetime('"paidTime"')} DESC
    ) AS "rn"
  FROM base
  WHERE "areaName" IS NOT NULL
    AND "areaName" <> ''
)
SELECT
  s."merchantName",
  s."dateKey" AS "date",
  (
    SELECT a."areaName"
    FROM area_pick a
    WHERE a."merchantName" = s."merchantName"
      AND a."dateKey" = s."dateKey"
      AND a."rn" = 1
  ) AS "areaName",
  COALESCE(b."paidOrderCount", 0) AS "paidOrderCount",
  COALESCE(b."paidAmountOnlineFen", 0) AS "paidAmountOnlineFen",
  COALESCE(b."paidAmountWalletFen", 0) AS "paidAmountWalletFen",
  COALESCE(b."paidAmountBonusFen", 0) AS "paidAmountBonusFen",
  COALESCE(b."paidAmountCardFen", 0) AS "paidAmountCardFen",
  COALESCE(r."refundAmountFen", 0) AS "refundAmountFen",
  COALESCE(b."verifyAmountFen", 0) AS "verifyAmountFen",
  COALESCE(b."orderCount", 0) AS "orderCount",
  COALESCE(b."packageCount", 0) AS "packageCount",
  ? AS "updatedAt"
FROM spine s
LEFT JOIN base_agg b ON b."merchantName" = s."merchantName" AND b."dateKey" = s."dateKey"
LEFT JOIN refundByMerchantDay r ON r."merchantName" = s."merchantName" AND r."dateKey" = s."dateKey";
`;

export async function recomputeMerchantDailyMetrics(
  prisma: PrismaService,
  startDate: string,
  endDate: string
): Promise<number> {
  const now = toSqliteDateTime();
  // Exclusive half-open paidTime bounds so OrderHeader_paidTime_idx can seek.
  const paidStart = beijingDayRangeSqlite(startDate).start;
  const paidEnd = beijingDayRangeSqlite(endDate).end;
  // Note: intentionally does NOT wrap in $transaction — the libsql adapter throws
  // "unknown variant SocketTimeout" on $executeRawUnsafe inside callback-style
  // $transaction. DELETE+INSERT pair is safe since the range would be rerun on the
  // next refresh if a crash occurs between the two statements.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "MerchantDailyMetrics" WHERE "date" >= ? AND "date" <= ?`,
    startDate,
    endDate
  );
  const inserted = await prisma.$executeRawUnsafe(
    MERCHANT_DAILY_METRICS_INSERT_SQL,
    paidStart,
    paidEnd,
    paidStart,
    paidEnd,
    now
  );
  return Number(inserted ?? 0);
}
