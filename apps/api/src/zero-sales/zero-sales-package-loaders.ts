/** Merchant-level package aggregates used by zero-sales views. */
import { PrismaService } from '../prisma/prisma.service';
import { queryInChunks } from '../common/sql-chunk';

export async function loadTotalSkuByMerchant(
  prisma: PrismaService,
  merchantIds: string[]
): Promise<Map<string, number>> {
  if (!merchantIds.length) return new Map();
  const skuRows = await queryInChunks(merchantIds, async (chunk) => {
    // stockLeft > 0 — align totalSku with in-stock inventory (stale candidates already filter stock).
    return (await prisma.$queryRawUnsafe(
      `SELECT "merchantId", COUNT(*) AS "c" FROM "ContentPackage" WHERE "merchantId" IN (${chunk.map(() => '?').join(',')}) AND "stockLeft" > 0 GROUP BY "merchantId"`,
      ...chunk
    )) as Array<{ merchantId: string; c: number }>;
  });
  return new Map(skuRows.map((r) => [r.merchantId, Number(r.c)]));
}
