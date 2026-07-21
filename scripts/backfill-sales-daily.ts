import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';
import { diffDailySales } from '../apps/api/src/domain/sales-daily';
import { localDateKey } from '@content/shared';

/**
 * 中台数据层：历史日销量 backfill。
 * 全量扫 JeeSiteInventoryDailySnapshot,按 (packageId, date) 排序后用 diff
 * 算出每日 salesQty,写入 PackageSalesDaily。deltaSource='backfill' 留痕。
 *
 * 执行方式: npx tsx scripts/backfill-sales-daily.ts
 * 幂等: ON CONFLICT DO UPDATE 重复执行安全
 */
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' }
  }
});

interface SnapRow {
  packageId: string;
  snapshotDate: string;
  remainingStock: number;
}

async function main() {
  await ensureDatabaseSchema(prisma);

  // 1. 全量拉快照
  const all = (await prisma.$queryRawUnsafe(`
    SELECT "packageId", "snapshotDate", "remainingStock"
    FROM "JeeSiteInventoryDailySnapshot"
    ORDER BY "packageId" ASC, "snapshotDate" ASC
  `)) as SnapRow[];
  console.log(`[backfill-sales-daily] total snapshot rows: ${all.length}`);

  if (all.length === 0) {
    console.log('[backfill-sales-daily] no snapshots, exiting');
    return;
  }

  // 2. 按 packageId 分组 → diff
  const byPackage = new Map<string, SnapRow[]>();
  for (const r of all) {
    if (!byPackage.has(r.packageId)) byPackage.set(r.packageId, []);
    byPackage.get(r.packageId)!.push(r);
  }

  type DailyRow = { packageId: string; date: string; salesQty: number; deltaSource: string };
  const dailyRows: DailyRow[] = [];
  for (const [, rows] of byPackage) {
    let prevStock: number | null = null;
    for (const r of rows) {
      const { salesQty, deltaSource } = diffDailySales({
        lastStock: prevStock,
        currentStock: r.remainingStock
      });
      dailyRows.push({
        packageId: r.packageId,
        date: r.snapshotDate,
        salesQty,
        deltaSource: deltaSource === 'manual_correction' ? 'manual_correction' : 'backfill'
      });
      prevStock = Math.max(0, Math.round(r.remainingStock));
    }
  }
  console.log(`[backfill-sales-daily] computed daily rows: ${dailyRows.length}`);

  // 3. 批量 upsert (4 字段/条,100/批 安全)
  const BATCH = 100;
  let written = 0;
  for (let i = 0; i < dailyRows.length; i += BATCH) {
    const batch = dailyRows.slice(i, i + BATCH);
    const valueClauses = batch.map(() => '(?, ?, ?, 0, 0, ?, CURRENT_TIMESTAMP)').join(', ');
    const params = batch.flatMap((r) => [r.packageId, r.date, r.salesQty, r.deltaSource]);
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "PackageSalesDaily" ("packageId", "date", "salesQty", "salesAmount", "refundQty", "deltaSource", "computedAt")
        VALUES ${valueClauses}
        ON CONFLICT("packageId", "date") DO UPDATE SET
          "salesQty" = excluded."salesQty",
          "deltaSource" = excluded."deltaSource",
          "computedAt" = CURRENT_TIMESTAMP
      `,
      ...params
    );
    written += batch.length;
  }

  // 4. 金额 pass：OrderHeader → salesAmount（不覆盖 salesQty）
  const { recomputePackageSalesAmountRange } =
    await import('../apps/api/src/money/package-sales-amount');
  const dates = dailyRows.map((r) => r.date).sort();
  const amountStart = dates[0] ?? localDateKey(new Date());
  const amountEnd = dates[dates.length - 1] ?? amountStart;
  let amountResult: unknown = null;
  try {
    amountResult = await recomputePackageSalesAmountRange(prisma, amountStart, amountEnd);
  } catch (err) {
    console.warn('[backfill-sales-daily] salesAmount recompute failed:', (err as Error).message);
  }

  // 5. 校验
  const total = await prisma.packageSalesDaily.count();
  const bySource = (await prisma.$queryRawUnsafe(`
    SELECT "deltaSource", COUNT(*) AS n
    FROM "PackageSalesDaily"
    GROUP BY "deltaSource"
  `)) as Array<{ deltaSource: string; n: number | bigint }>;
  console.log(
    JSON.stringify(
      {
        backfillWritten: written,
        tableTotal: total,
        bySource: bySource.map((b) => ({ deltaSource: b.deltaSource, n: Number(b.n) })),
        salesAmount: amountResult,
        todayKey: localDateKey(new Date())
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
