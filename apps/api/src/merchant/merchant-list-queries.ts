/** SQL heads for merchant list and metric-first reads. */
import type { PrismaService } from '../prisma/prisma.service';
import { likeContains } from '../common/like-escape';
import { MERCHANT_LIST_CACHE_CAP, PLATFORM_SCAN_LIMIT } from '../common/sql-chunk';
import type { MerchantListItem, MerchantRow } from './merchant-list-types';

/** Shared ContentPackage filters for merchant list heads. */
export function buildMerchantListFilters(q: {
  areaId?: string;
  search?: string;
  areaIds?: string[];
  merchantIds?: string[];
}): { filters: string[]; params: string[] } {
  const filters = [`"merchantId" IS NOT NULL`, `"merchantId" <> ''`, `"stockLeft" > 0`];
  const params: string[] = [];
  if (q.areaIds?.length) {
    const areaIds = q.areaIds.slice(0, 200);
    filters.push(`"areaId" IN (${areaIds.map(() => '?').join(',')})`);
    params.push(...areaIds);
  } else if (q.areaId) {
    filters.push(`"areaId" = ?`);
    params.push(q.areaId);
  }
  if (q.merchantIds?.length) {
    const merchantIds = q.merchantIds.slice(0, 200);
    filters.push(`"merchantId" IN (${merchantIds.map(() => '?').join(',')})`);
    params.push(...merchantIds);
  }
  if (q.search) {
    filters.push(`"merchantName" LIKE ? ESCAPE '\\'`);
    params.push(likeContains(q.search));
  }
  return { filters, params };
}

export async function listMerchantRows(
  prisma: PrismaService,
  q: {
    areaId?: string;
    search?: string;
    areaIds?: string[];
    merchantIds?: string[];
    /**
     * When sort is totalSkuDesc, push ORDER BY totalSku DESC + LIMIT CACHE_CAP
     * so sales enrichment never expands packages for merchants that would be
     * dropped after in-memory sort (prune-before-enrich).
     */
    sort?: 'totalSkuDesc' | 'totalGmvDesc' | 'staleDesc' | 'stale30Desc' | string;
  }
): Promise<MerchantRow[]> {
  const { filters, params } = buildMerchantListFilters(q);
  // Cap at MERCHANT_LIST_CACHE_CAP (not full PLATFORM_SCAN) — enrichment still
  // expands packages for every returned merchant; prune early.
  const limit = Math.min(PLATFORM_SCAN_LIMIT, MERCHANT_LIST_CACHE_CAP);
  const orderBy =
    q.sort === 'totalSkuDesc' ? `"totalSku" DESC, "merchantId" ASC` : `"merchantId" ASC`;
  return (await prisma.$queryRawUnsafe(
    `SELECT "merchantId", MIN("merchantName") AS "merchantName", MIN("areaId") AS "areaId", MIN("areaName") AS "areaName", COUNT(*) AS "totalSku" FROM "ContentPackage" WHERE ${filters.join(' AND ')} GROUP BY "merchantId" ORDER BY ${orderBy} LIMIT ?`,
    ...params,
    limit
  )) as MerchantRow[];
}

/**
 * Metric-first head for totalGmvDesc / stale30Desc.
 * Previous path: LIMIT CAP by merchantId ASC then enrich + re-sort — top GMV/stale
 * merchants could be missing from the capped set. Now metrics are computed in SQL
 * and ORDER BY metric + LIMIT CAP prunes before any further work.
 *
 * Param order: filter params…, staleThreshold (recent), staleThreshold (gmv), limit.
 */
export async function listMerchantRowsByMetric(
  prisma: PrismaService,
  q: {
    areaId?: string;
    search?: string;
    areaIds?: string[];
    merchantIds?: string[];
    sort: 'totalGmvDesc' | 'stale30Desc' | 'staleDesc' | string;
    staleThreshold: string;
    limit?: number;
  }
): Promise<MerchantListItem[]> {
  const { filters, params } = buildMerchantListFilters(q);
  const limit = Math.min(PLATFORM_SCAN_LIMIT, Math.max(1, q.limit ?? MERCHANT_LIST_CACHE_CAP));
  const orderBy =
    q.sort === 'totalGmvDesc'
      ? `"totalGmv30d" DESC, "merchantId" ASC`
      : `"stale30SkuCount" DESC, "merchantId" ASC`;
  // Param order matches SQL placeholders: filters → recent threshold → gmv threshold → limit.
  const sql = `
WITH pkgs AS (
  SELECT "packageId", "merchantId", "merchantName", "areaId", "areaName"
  FROM "ContentPackage"
  WHERE ${filters.join(' AND ')}
),
merchant_base AS (
  SELECT
    "merchantId",
    MIN("merchantName") AS "merchantName",
    MIN("areaId") AS "areaId",
    MIN("areaName") AS "areaName",
    COUNT(*) AS "totalSku"
  FROM pkgs
  GROUP BY "merchantId"
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
),
metrics AS (
  SELECT
    p."merchantId" AS "merchantId",
    SUM(CASE WHEN r."packageId" IS NULL THEN 1 ELSE 0 END) AS "stale30SkuCount",
    COALESCE(SUM(g."gmv30d"), 0) AS "gmv30d"
  FROM pkgs p
  LEFT JOIN recent r ON r."packageId" = p."packageId"
  LEFT JOIN gmv g ON g."packageId" = p."packageId"
  GROUP BY p."merchantId"
)
SELECT
  mb."merchantId" AS "merchantId",
  mb."merchantName" AS "merchantName",
  mb."areaId" AS "areaId",
  mb."areaName" AS "areaName",
  mb."totalSku" AS "totalSku",
  COALESCE(m."stale30SkuCount", 0) AS "stale30SkuCount",
  COALESCE(m."gmv30d", 0) AS "totalGmv30d"
FROM merchant_base mb
LEFT JOIN metrics m ON m."merchantId" = mb."merchantId"
ORDER BY ${orderBy}
LIMIT ?
`;
  const rows = (await prisma.$queryRawUnsafe(
    sql,
    ...params,
    q.staleThreshold,
    q.staleThreshold,
    limit
  )) as Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
    totalSku: number | bigint;
    stale30SkuCount: number | bigint;
    totalGmv30d: number | bigint;
  }>;
  return rows.map((r) => {
    const totalSku = Number(r.totalSku);
    const stale30SkuCount = Number(r.stale30SkuCount);
    return {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      areaId: r.areaId,
      areaName: r.areaName,
      totalSku,
      stale30SkuCount,
      stale30Ratio: totalSku > 0 ? stale30SkuCount / totalSku : 0,
      totalGmv30d: Number(r.totalGmv30d)
    };
  });
}
