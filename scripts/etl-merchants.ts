import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';

/**
 * 中台数据层：商家 ETL。
 * 从 ContentPackage dedupe 出 distinct (merchantId, merchantName, areaId, areaName)
 * upsert 到 Merchant,再单独用一次 SQL 聚合更新 totalSku。
 *
 * 执行方式: npx tsx scripts/etl-merchants.ts
 * 幂等: 可重复执行
 */
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' }
  }
});

async function main() {
  await ensureDatabaseSchema(prisma);

  // 1. 拉 distinct 商家
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT
      "merchantId",
      MIN("merchantName") AS "merchantName",
      MIN("areaId")        AS "areaId",
      MIN("areaName")      AS "areaName"
    FROM "ContentPackage"
    WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''
    GROUP BY "merchantId"
  `)) as Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
  }>;

  console.log(`[etl-merchants] distinct merchants from ContentPackage: ${rows.length}`);

  if (rows.length === 0) {
    console.log('[etl-merchants] no merchants to upsert, exiting');
    return;
  }

  // 2. 批量 upsert (100 条/批,SQLite 单语句参数上限安全线)
  const BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const valueClauses = batch
      .map(() => '(?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .join(', ');
    const params = batch.flatMap((m) => [m.merchantId, m.merchantName, m.areaId, m.areaName]);
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "Merchant" ("merchantId", "merchantName", "areaId", "areaName", "firstSeenAt", "lastSeenAt")
        VALUES ${valueClauses}
        ON CONFLICT("merchantId") DO UPDATE SET
          "merchantName" = excluded."merchantName",
          "areaId"       = COALESCE(excluded."areaId", "Merchant"."areaId"),
          "areaName"     = COALESCE(excluded."areaName", "Merchant"."areaName"),
          "lastSeenAt"   = CURRENT_TIMESTAMP
      `,
      ...params
    );
    upserted += batch.length;
  }

  // 3. 更新 totalSku
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Merchant"
    SET "totalSku" = COALESCE((
      SELECT COUNT(*) FROM "ContentPackage" WHERE "ContentPackage"."merchantId" = "Merchant"."merchantId"
    ), 0)
  `);
  console.log(`[etl-merchants] upserted=${upserted}, totalSku rows updated=${updated}`);

  // 4. 校验
  const count = await prisma.merchant.count();
  const totalSku = await prisma.merchant.aggregate({ _sum: { totalSku: true } });
  console.log(JSON.stringify({ merchantCount: count, totalSku: totalSku._sum.totalSku }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
