import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { recomputeMerchantDailyMetrics } from '../apps/api/src/merchant-sales/merchant-sales-query';

/**
 * 中台数据层：MerchantDailyMetrics 聚合回填
 *
 * 复用 recomputeMerchantDailyMetrics —— 与实时商家销售查询 / DailyMetrics 回填
 * 统一口径：
 *   - 支付类指标按 paidTime 北京日半开窗口聚合 (base CTE)；
 *   - 退款类指标按 orderTime 北京日窗口聚合 (refundByMerchantDay CTE)，
 *     即退款数量/金额归属到"下单日"而非"退款发生日"（业务规则）。
 *
 * 执行：
 *   DATABASE_URL=file:E:/Program/Content Operation Platform/prisma/dev.db npx tsx scripts/backfill-merchant-daily-metrics.ts
 * 可选：MERCHANT_DAILY_METRICS_BACKFILL_DAYS=180（默认 180，窗口内先 DELETE 再写入）
 */
const dbUrl = process.env.DATABASE_URL ?? `file:${process.cwd().replace(/\\/g, '/')}/prisma/dev.db`;

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

async function main() {
  await ensureDatabaseSchema(prisma);
  const today = beijingDateKey(new Date());
  const days = Number(process.env.MERCHANT_DAILY_METRICS_BACKFILL_DAYS ?? 180);
  const startDate = shiftDateKey(today, -(Math.max(1, days) - 1));

  // 复用统一口径的 recompute (与实时商家销售查询一致)
  const result = await recomputeMerchantDailyMetrics(prisma, startDate, today);

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
             ("paidAmountOnlineFen" + "paidAmountWalletFen") / 100.0 AS "gmv",
             "paidOrderCount",
             "refundAmountFen" / 100.0 AS "refundAmount"
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
        startDate,
        endDate: today,
        recompute: result,
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
  .finally(async () => {
    await prisma.$disconnect();
  });
