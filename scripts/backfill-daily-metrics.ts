import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { recomputeDailyMetricsRange } from '../apps/api/src/money/daily-metrics-recompute';

/**
 * 中台数据层：DailyMetrics 聚合回填
 *
 * 从 OrderHeader 按北京日聚合 upsert 到 DailyMetrics（共享 recomputeDailyMetricsRange）。
 * SalesSnapshot 不是上游。
 *
 * GMV 口径：online + wallet；bonus 单独披露。
 *
 * 执行：DATABASE_URL=file:E:/Program/Content Operation Platform/prisma/dev.db npx tsx scripts/backfill-daily-metrics.ts
 * 可选：DAILY_METRICS_BACKFILL_DAYS=180（默认 180，全量重建时先 DELETE 全表再写入窗口）
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
  const days = Number(process.env.DAILY_METRICS_BACKFILL_DAYS ?? 180);
  const startDate = shiftDateKey(today, -(Math.max(1, days) - 1));

  // CLI full rebuild for the window: clear only the window via recompute (not whole table forever)
  // For a true full rebuild of all history, set a large DAILY_METRICS_BACKFILL_DAYS.
  const result = await recomputeDailyMetricsRange(prisma, startDate, today);

  const count = await prisma.dailyMetrics.count();
  const sample = await prisma.$queryRawUnsafe<
    Array<{
      date: string;
      totalGmv: number;
      gmvOnline: number;
      gmvWallet: number;
      gmvBonus: number;
      activeMerchants: number;
      refundRate: number;
    }>
  >(
    `
      -- Phase 6 dropped the legacy Float GMV columns; read the Fen columns and
      -- render yuan so this sample stays readable (SQLite would otherwise
      -- silently degrade unknown "identifiers" to string literals).
      SELECT "date",
             "totalGmvFen" / 100.0 AS "totalGmv",
             "gmvOnlineFen" / 100.0 AS "gmvOnline",
             "gmvWalletFen" / 100.0 AS "gmvWallet",
             "gmvBonusFen" / 100.0 AS "gmvBonus",
             "activeMerchants",
             "refundRate"
      FROM "DailyMetrics"
      ORDER BY "date" DESC
      LIMIT 14
    `
  );

  console.log(
    JSON.stringify(
      {
        today,
        daysWindow: days,
        recompute: result,
        tableCount: count,
        latestDays: sample
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
