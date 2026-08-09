/** Batched merchant metric enrichment and row-to-item projection. */
import { queryInChunks } from '../common/sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';
import type { MerchantListItem, MerchantRow } from './merchant-list-types';

/**
 * Single-pass merchant metrics (stale30 + GMV30d) per merchant-id chunk.
 * Previous path: load all packages → DISTINCT recent sales → GMV by package → JS rollup
 * (3 scans + 10k package materialize). Now one SQL groups packages with LEFT JOIN sales.
 */
export async function collectMerchantMetricMaps(params: {
  prisma: PrismaService;
  merchantIds: string[];
  staleThreshold: string;
}): Promise<{
  stale30ByMerchant: Map<string, number>;
  gmvByMerchant: Map<string, number>;
}> {
  const stale30ByMerchant = new Map<string, number>();
  const gmvByMerchant = new Map<string, number>();
  if (!params.merchantIds.length) return { stale30ByMerchant, gmvByMerchant };

  const rows = await queryInChunks(params.merchantIds, async (chunk) => {
    const ph = chunk.map(() => '?').join(',');
    // Param order: merchantIds…, staleThreshold (recent), staleThreshold (gmv).
    return (await params.prisma.$queryRawUnsafe(
      `WITH pkgs AS (
         SELECT "packageId", "merchantId"
         FROM "ContentPackage"
         WHERE "merchantId" IN (${ph})
           AND "stockLeft" > 0
       ),
       recent AS (
         SELECT DISTINCT s."packageId" AS "packageId"
         FROM "PackageSalesDaily" s
         INNER JOIN pkgs p ON p."packageId" = s."packageId"
         WHERE s."date" >= ? AND s."salesQty" > 0
       ),
       gmv AS (
         SELECT s."packageId" AS "packageId",
                COALESCE(SUM(s."salesAmountFen"), 0) AS "gmv30d"
         FROM "PackageSalesDaily" s
         INNER JOIN pkgs p ON p."packageId" = s."packageId"
         WHERE s."date" >= ? AND s."salesQty" > 0
         GROUP BY s."packageId"
       )
       SELECT
         p."merchantId" AS "merchantId",
         SUM(CASE WHEN r."packageId" IS NULL THEN 1 ELSE 0 END) AS "stale30SkuCount",
         COALESCE(SUM(g."gmv30d"), 0) AS "gmv30d"
       FROM pkgs p
       LEFT JOIN recent r ON r."packageId" = p."packageId"
       LEFT JOIN gmv g ON g."packageId" = p."packageId"
       GROUP BY p."merchantId"`,
      ...chunk,
      params.staleThreshold,
      params.staleThreshold
    )) as Array<{ merchantId: string; stale30SkuCount: number; gmv30d: number }>;
  });

  for (const r of rows) {
    stale30ByMerchant.set(r.merchantId, Number(r.stale30SkuCount));
    gmvByMerchant.set(r.merchantId, Number(r.gmv30d));
  }
  return { stale30ByMerchant, gmvByMerchant };
}

export async function aggregateMerchantListMetrics(params: {
  prisma: PrismaService;
  merchants: MerchantRow[];
  staleThreshold: string;
}): Promise<MerchantListItem[]> {
  const { stale30ByMerchant, gmvByMerchant } = await collectMerchantMetricMaps({
    prisma: params.prisma,
    merchantIds: params.merchants.map((m) => m.merchantId),
    staleThreshold: params.staleThreshold
  });
  return params.merchants.map((m) => ({
    merchantId: m.merchantId,
    merchantName: m.merchantName,
    areaId: m.areaId,
    areaName: m.areaName,
    totalSku: Number(m.totalSku),
    stale30SkuCount: stale30ByMerchant.get(m.merchantId) ?? 0,
    stale30Ratio:
      Number(m.totalSku) > 0 ? (stale30ByMerchant.get(m.merchantId) ?? 0) / Number(m.totalSku) : 0,
    totalGmv30d: gmvByMerchant.get(m.merchantId) ?? 0
  }));
}

export async function buildMerchantListItems(params: {
  prisma: PrismaService;
  merchants: MerchantRow[];
  staleThreshold: string;
}): Promise<MerchantListItem[]> {
  return aggregateMerchantListMetrics(params);
}
