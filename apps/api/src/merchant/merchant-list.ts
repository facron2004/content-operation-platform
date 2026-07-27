import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import type { MerchantsListQueryDto } from './merchant.dto';
import { likeContains } from '../common/like-escape';
import {
  MERCHANT_LIST_CACHE_CAP,
  PLATFORM_SCAN_LIMIT,
  clampListPage,
  clampListPageSize,
  queryInChunks
} from '../common/sql-chunk';

export type MerchantListItem = {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
  stale30SkuCount: number;
  stale30Ratio: number;
  totalGmv30d: number;
};

export type MerchantRow = {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
};

/** Shared ContentPackage filters for merchant list heads. */
function buildMerchantListFilters(q: {
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
         COALESCE(SUM(s."salesAmount"), 0) AS "gmv30d"
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
                COALESCE(SUM(s."salesAmount"), 0) AS "gmv30d"
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
  merchants: Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
    totalSku: number | bigint;
  }>;
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
  merchants: Array<{
    merchantId: string;
    merchantName: string;
    areaId: string | null;
    areaName: string | null;
    totalSku: number | bigint;
  }>;
  staleThreshold: string;
}): Promise<MerchantListItem[]> {
  return aggregateMerchantListMetrics(params);
}

export function sortMerchantItems(
  items: MerchantListItem[],
  sort: 'totalSkuDesc' | 'totalGmvDesc' | 'staleDesc' | 'stale30Desc' | string | undefined
): void {
  if (sort === 'totalSkuDesc') {
    items.sort((a, b) => b.totalSku - a.totalSku || a.merchantId.localeCompare(b.merchantId));
  } else if (sort === 'totalGmvDesc') {
    items.sort((a, b) => b.totalGmv30d - a.totalGmv30d || a.merchantId.localeCompare(b.merchantId));
  } else {
    // Default / stale30Desc / staleDesc
    items.sort(
      (a, b) => b.stale30SkuCount - a.stale30SkuCount || a.merchantId.localeCompare(b.merchantId)
    );
  }
}

export function paginateMerchantItems(items: MerchantListItem[], query: MerchantsListQueryDto) {
  // Defense-in-depth: DTO Max may be bypassed if pipe is misconfigured.
  const page = clampListPage(query.page, 100);
  const pageSize = clampListPageSize(query.pageSize);
  const offset = (page - 1) * pageSize;
  // Residual #266: total is head-window size (≤ MERCHANT_LIST_CACHE_CAP), not
  // full catalog cardinality. Surface limit/truncated so SPA can warn.
  const limit = MERCHANT_LIST_CACHE_CAP;
  return {
    items: items.slice(offset, offset + pageSize),
    pagination: {
      page,
      pageSize,
      hasMore: items.length > offset + pageSize,
      total: items.length
    },
    limit,
    truncated: items.length >= limit
  };
}

/**
 * Full merchant aggregate (sorted). Page is applied by the caller so a TTL
 * cache can share one scan across every page flip for the same filters/scope.
 *
 * totalSkuDesc: prune-by-totalSku then enrich metrics.
 * totalGmvDesc / stale30Desc: metric-first SQL head (ORDER BY metric LIMIT CAP).
 */
export async function computeMerchantsWithStale(params: {
  prisma: PrismaService;
  query: Pick<MerchantsListQueryDto, 'areaId' | 'search' | 'sort'>;
  scope?: { merchantIds?: string[]; areaIds?: string[] };
  /** Override for tests / cache key alignment. Defaults to Beijing today. */
  today?: string;
}): Promise<MerchantListItem[]> {
  const today = params.today ?? beijingDateKey(new Date());
  const rules = DEFAULT_INVENTORY_RULES;
  const staleThreshold = shiftDateKey(today, -(rules.stale30Days - 1));
  const sort: string = params.query.sort ?? 'stale30Desc';
  const scopeQ = {
    areaId: params.query.areaId,
    search: params.query.search,
    areaIds: params.scope?.areaIds,
    merchantIds: params.scope?.merchantIds
  };

  // Metric-first head — avoid merchantId-ordered CAP dropping top GMV/stale merchants.
  if (sort === 'totalGmvDesc' || sort === 'stale30Desc' || sort === 'staleDesc') {
    const items = await listMerchantRowsByMetric(params.prisma, {
      ...scopeQ,
      sort,
      staleThreshold,
      limit: MERCHANT_LIST_CACHE_CAP
    });
    // Already ordered by SQL; re-sort for stable ties.
    sortMerchantItems(items, sort);
    return items.length <= MERCHANT_LIST_CACHE_CAP
      ? items
      : items.slice(0, MERCHANT_LIST_CACHE_CAP);
  }

  const merchants = await listMerchantRows(params.prisma, {
    ...scopeQ,
    sort
  });
  const items = await buildMerchantListItems({
    prisma: params.prisma,
    merchants,
    staleThreshold
  });
  sortMerchantItems(items, sort);
  // Bound TTL-cached aggregate (parity with MOVEMENT_CACHE_CAP).
  return items.length <= MERCHANT_LIST_CACHE_CAP ? items : items.slice(0, MERCHANT_LIST_CACHE_CAP);
}

export async function listMerchantsWithStale(params: {
  prisma: PrismaService;
  query: MerchantsListQueryDto;
  scope?: { merchantIds?: string[]; areaIds?: string[] };
}) {
  const items = await computeMerchantsWithStale(params);
  return paginateMerchantItems(items, params.query);
}

/** Stable cache key for the full aggregate (page/pageSize intentionally excluded). */
export function merchantListCacheKey(params: {
  query: Pick<MerchantsListQueryDto, 'areaId' | 'search' | 'sort'>;
  scope?: { merchantIds?: string[]; areaIds?: string[] };
  today: string;
}): string {
  const areaIds = [...(params.scope?.areaIds ?? [])].sort();
  const merchantIds = [...(params.scope?.merchantIds ?? [])].sort();
  return [
    'merchants:list',
    params.today,
    params.query.sort ?? 'stale30Desc',
    params.query.areaId ?? '',
    params.query.search ?? '',
    areaIds.join(','),
    merchantIds.join(',')
  ].join('|');
}
