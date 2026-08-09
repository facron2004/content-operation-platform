const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const client = createClient({ url: `file:${dbPath}` });

async function recomputeAll() {
  console.log('--- Recomputing DailyMetrics & MerchantDailyMetrics directly in SQLite ---');

  // 1. Recompute DailyMetrics
  console.log('1. Recomputing DailyMetrics from OrderHeader...');
  const dmQuery = `
    INSERT OR REPLACE INTO "DailyMetrics" (
      "date", "totalGmvFen", "gmvOnlineFen", "gmvWalletFen", "gmvBonusFen", "gmvCardFen",
      "totalRefundFen", "refundRate", "totalVerifyFen", "verifyRate",
      "paidOrderCount", "paidAmountBonusFen", "paidAmountWalletFen", "updatedAt"
    )
    SELECT
      DATE("paidTime", '+8 hours') as d,
      COALESCE(SUM(COALESCE("paidAmountFen", 0) + COALESCE("paidAmountWalletFen", 0)), 0) as totalGmvFen,
      COALESCE(SUM("paidAmountFen"), 0) as gmvOnlineFen,
      COALESCE(SUM("paidAmountWalletFen"), 0) as gmvWalletFen,
      COALESCE(SUM("paidAmountBonusFen"), 0) as gmvBonusFen,
      COALESCE(SUM("paidAmountCardFen"), 0) as gmvCardFen,
      COALESCE(SUM("refundAmountFen"), 0) as totalRefundFen,
      CASE
        WHEN SUM(COALESCE("paidAmountFen", 0) + COALESCE("paidAmountWalletFen", 0)) > 0
        THEN CAST(COALESCE(SUM("refundAmountFen"), 0) AS REAL) / SUM(COALESCE("paidAmountFen", 0) + COALESCE("paidAmountWalletFen", 0))
        ELSE 0.0
      END as refundRate,
      COALESCE(SUM(CASE WHEN "verifyTime" IS NOT NULL THEN COALESCE("verifyAmountFen", 0) ELSE 0 END), 0) as totalVerifyFen,
      CASE
        WHEN SUM(COALESCE("paidAmountFen", 0) + COALESCE("paidAmountWalletFen", 0)) > 0
        THEN CAST(COALESCE(SUM(CASE WHEN "verifyTime" IS NOT NULL THEN COALESCE("verifyAmountFen", 0) ELSE 0 END), 0) AS REAL) / SUM(COALESCE("paidAmountFen", 0) + COALESCE("paidAmountWalletFen", 0))
        ELSE 0.0
      END as verifyRate,
      COUNT("orderId") as paidOrderCount,
      COALESCE(SUM("paidAmountBonusFen"), 0) as paidAmountBonusFen,
      COALESCE(SUM("paidAmountWalletFen"), 0) as paidAmountWalletFen,
      DATETIME('now') as updatedAt
    FROM "OrderHeader"
    WHERE "paidTime" IS NOT NULL AND "status" IN ('paid', 'completed', 'refunded', 'verified')
    GROUP BY d;
  `;

  await client.execute(dmQuery);
  console.log('DailyMetrics recomputed and saved.');

  // 2. Recompute MerchantDailyMetrics
  console.log('2. Recomputing MerchantDailyMetrics from OrderHeader...');
  const mdmQuery = `
    INSERT OR REPLACE INTO "MerchantDailyMetrics" (
      "merchantName", "date", "areaName",
      "paidOrderCount", "paidAmountOnlineFen", "paidAmountWalletFen", "paidAmountBonusFen",
      "paidAmountCardFen", "verifyAmountFen", "refundAmountFen", "updatedAt"
    )
    SELECT
      "merchantName",
      DATE("paidTime", '+8 hours') as d,
      MAX("areaName") as areaName,
      COUNT("orderId") as paidOrderCount,
      COALESCE(SUM("paidAmountFen"), 0) as paidAmountOnlineFen,
      COALESCE(SUM("paidAmountWalletFen"), 0) as paidAmountWalletFen,
      COALESCE(SUM("paidAmountBonusFen"), 0) as paidAmountBonusFen,
      COALESCE(SUM("paidAmountCardFen"), 0) as paidAmountCardFen,
      COALESCE(SUM(CASE WHEN "verifyTime" IS NOT NULL THEN COALESCE("verifyAmountFen", 0) ELSE 0 END), 0) as verifyAmountFen,
      COALESCE(SUM("refundAmountFen"), 0) as refundAmountFen,
      DATETIME('now') as updatedAt
    FROM "OrderHeader"
    WHERE "paidTime" IS NOT NULL AND "merchantName" IS NOT NULL
    GROUP BY "merchantName", d;
  `;

  await client.execute(mdmQuery);
  console.log('MerchantDailyMetrics recomputed and saved.');

  // Verify rows
  const dmCount = await client.execute('SELECT COUNT(*) as c FROM "DailyMetrics"');
  const mdmCount = await client.execute('SELECT COUNT(*) as c FROM "MerchantDailyMetrics"');
  console.log(`Summary: DailyMetrics has ${dmCount.rows[0].c} rows, MerchantDailyMetrics has ${mdmCount.rows[0].c} rows.`);
}

recomputeAll().catch(console.error);
