import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';
import { localDateKey } from '@content/shared';

/**
 * 中台数据层:MerchantDailyMetrics 聚合回填
 *
 * 从 OrderHeader(JeSite ETL 真实订单)按 (merchantName, date) 聚合回填到
 * MerchantDailyMetrics 表,作为商家销售数据看板的数据源。
 *
 * 字段映射(与 gmv.service.ts:14-22 GMV 口径一致):
 *   - totalGmv(在 API 层计算) = paidAmountOnline + paidAmountWallet
 *   - paidOrderCount   = COUNT(orders WHERE status IN ('paid','verified'))
 *   - paidAmountOnline = SUM(paidAmount)   (legacy 字段,等价 paidAmountOnline)
 *   - paidAmountWallet = SUM(paidAmountWallet)
 *   - paidAmountBonus  = SUM(paidAmountBonus)   单独披露,不入 GMV
 *   - paidAmountCard   = SUM(paidAmountCard)    单独披露,不入 GMV
 *   - refundAmount     = SUM(refundAmount)
 *   - verifyAmount     = SUM(verifyAmount)
 *   - orderCount       = COUNT(*)
 *   - packageCount     = COUNT(DISTINCT packageId)   即"动销 SKU 数"
 *   - areaName         = (merchantName, date) 当日最新已支付订单的 areaName(显示用)
 *
 * 时间口径:date(orderTime, '+8 hours') — 北京时间切日(与 gmv.service.ts:212-224 的
 * SalesSnapshot 口径一致)。
 *
 * 桶键:merchantName 而不是 merchantId。原因见 gmv.service.ts:539-541,同一商家
 * 在 JeSite 可能对应 188 个 merchantId,用 name 才能在商家榜单上聚成一行。
 */
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' }
  }
});

async function main() {
  await ensureDatabaseSchema(prisma);
  const today = localDateKey(new Date());

  // 历史窗口(包含今天)
  const days = 180;

  // 1) 清空该窗口的数据,保证可重复运行
  await prisma.$executeRawUnsafe(
    `DELETE FROM "MerchantDailyMetrics" WHERE "date" >= date('now', ?)`,
    `-${days - 1} days`
  );

  // 2) 聚合插入
  const inserted = await prisma.$executeRawUnsafe(
    `
      INSERT OR REPLACE INTO "MerchantDailyMetrics" (
        "merchantName", "date", "areaName",
        "paidOrderCount", "paidAmountOnline", "paidAmountOnlineFen",
        "paidAmountWallet", "paidAmountWalletFen",
        "paidAmountBonus", "paidAmountBonusFen",
        "paidAmountCard", "paidAmountCardFen",
        "refundAmount", "refundAmountFen",
        "verifyAmount", "verifyAmountFen",
        "orderCount", "packageCount",
        "updatedAt"
      )
      SELECT
        COALESCE(NULLIF(oh."merchantName", ''), '(未知)') AS "merchantName",
        date(oh."orderTime", '+8 hours') AS "date",
        (
          SELECT oh2."areaName"
            FROM "OrderHeader" oh2
           WHERE oh2."merchantName" = COALESCE(NULLIF(oh."merchantName", ''), '(未知)')
             AND date(oh2."orderTime", '+8 hours') = date(oh."orderTime", '+8 hours')
             AND oh2."areaName" IS NOT NULL
             AND oh2."areaName" <> ''
             AND oh2."status" IN ('paid','verified')
           ORDER BY oh2."paidTime" DESC
           LIMIT 1
        ) AS "areaName",
        SUM(CASE WHEN oh."status" IN ('paid','verified') THEN 1 ELSE 0 END) AS "paidOrderCount",
        COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmount" ELSE 0 END), 0) AS "paidAmountOnline",
        CAST(ROUND(COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmount" ELSE 0 END), 0) * 100) AS INTEGER) AS "paidAmountOnlineFen",
        COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmountWallet" ELSE 0 END), 0) AS "paidAmountWallet",
        CAST(ROUND(COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmountWallet" ELSE 0 END), 0) * 100) AS INTEGER) AS "paidAmountWalletFen",
        COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmountBonus" ELSE 0 END), 0) AS "paidAmountBonus",
        CAST(ROUND(COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmountBonus" ELSE 0 END), 0) * 100) AS INTEGER) AS "paidAmountBonusFen",
        COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmountCard" ELSE 0 END), 0) AS "paidAmountCard",
        CAST(ROUND(COALESCE(SUM(CASE WHEN oh."status" IN ('paid','verified') THEN oh."paidAmountCard" ELSE 0 END), 0) * 100) AS INTEGER) AS "paidAmountCardFen",
        COALESCE(SUM(oh."refundAmount"), 0) AS "refundAmount",
        CAST(ROUND(COALESCE(SUM(oh."refundAmount"), 0) * 100) AS INTEGER) AS "refundAmountFen",
        COALESCE(SUM(oh."verifyAmount"), 0) AS "verifyAmount",
        CAST(ROUND(COALESCE(SUM(oh."verifyAmount"), 0) * 100) AS INTEGER) AS "verifyAmountFen",
        COUNT(*) AS "orderCount",
        COUNT(DISTINCT oh."packageId") AS "packageCount",
        CURRENT_TIMESTAMP AS "updatedAt"
      FROM "OrderHeader" oh
      WHERE date(oh."orderTime", '+8 hours') >= date('now', ?)
      GROUP BY COALESCE(NULLIF(oh."merchantName", ''), '(未知)'),
               date(oh."orderTime", '+8 hours')
    `,
    `-${days - 1} days`
  );

  // 3) 校验
  const count = await prisma.merchantDailyMetrics.count();
  const sample = await prisma.$queryRawUnsafe<
    Array<{
      merchantName: string;
      date: string;
      gmv: number;
      paidOrderCount: number;
      refundAmount: number;
    }>
  >(
    `
      SELECT "merchantName",
             "date",
             ("paidAmountOnline" + "paidAmountWallet") AS "gmv",
             "paidOrderCount",
             "refundAmount"
        FROM "MerchantDailyMetrics"
       ORDER BY "date" DESC, "gmv" DESC
       LIMIT 10
    `
  );

  console.log(
    JSON.stringify(
      {
        today,
        daysWindow: days,
        rowsInserted: Number(inserted),
        tableCount: count,
        top10Latest: sample
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
