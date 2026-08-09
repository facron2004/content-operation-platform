/** Candidate, metric, and page-head loaders for zero-sales SKUs. */
import { shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ZeroSalesSkuRow } from './zero-sales.dto';
import { likeContains } from '../common/like-escape';
import { PLATFORM_SCAN_LIMIT, ZERO_SALES_SKUS_CACHE_CAP, queryInChunks } from '../common/sql-chunk';

export function buildZeroSalesSkuFilters(args: {
  merchantId?: string;
  merchantIds?: string[];
  category?: string;
  areaId?: string;
  areaIds?: string[];
  search?: string;
  threshold: string;
}): { filters: string[]; params: string[] } {
  const params: string[] = [],
    filters: string[] = ['cp."stockLeft" > 0'];
  if (args.merchantIds?.length) {
    const merchantIds = args.merchantIds.slice(0, 200);
    filters.push(`cp."merchantId" IN (${merchantIds.map(() => '?').join(',')})`);
    params.push(...merchantIds);
  } else if (args.merchantId) {
    filters.push('cp."merchantId" = ?');
    params.push(args.merchantId);
  }
  if (args.category) {
    filters.push('cp."category" = ?');
    params.push(args.category);
  }
  if (args.areaIds?.length) {
    const areaIds = args.areaIds.slice(0, 200);
    filters.push(`cp."areaId" IN (${areaIds.map(() => '?').join(',')})`);
    params.push(...areaIds);
  } else if (args.areaId) {
    filters.push('cp."areaId" = ?');
    params.push(args.areaId);
  }
  if (args.search) {
    filters.push(`(cp."packageName" LIKE ? ESCAPE '\\' OR cp."merchantName" LIKE ? ESCAPE '\\')`);
    const kw = likeContains(args.search);
    params.push(kw, kw);
  }
  filters.push(
    `NOT EXISTS (SELECT 1 FROM "PackageSalesDaily" s WHERE s."packageId" = cp."packageId" AND s."salesQty" > 0 AND s."date" >= ?)`
  );
  params.push(args.threshold);
  return { filters, params };
}

/**
 * Cheap zero-sales SKU candidates (movement-style).
 * Filter-first ContentPackage + NOT EXISTS recent sale, ORDER BY packageId ASC,
 * LIMIT ≤ min(PLATFORM_SCAN, CAP). Metrics (last sale / 30d GMV) are batch-enriched
 * after the LIMIT so correlated ORDER BY never forces full-filter evaluation.
 */
export type ZeroSalesSkuCandidate = {
  packageId: string;
  packageName: string;
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  salePriceFen: bigint | null;
  stockLeft: number;
  stockTotal: number;
};

const ZERO_SALES_SKU_CANDIDATE_SELECT = `
  cp."packageId" AS "packageId",
  cp."packageName" AS "packageName",
  cp."merchantId" AS "merchantId",
  cp."merchantName" AS "merchantName",
  cp."areaName" AS "areaName",
  cp."category" AS "category",
  cp."salePriceFen" AS "salePriceFen",
  cp."stockLeft" AS "stockLeft",
  cp."stockTotal" AS "stockTotal"
`;

export async function loadZeroSalesSkuCandidates(
  prisma: PrismaService,
  args: {
    threshold: string;
    merchantId?: string;
    merchantIds?: string[];
    category?: string;
    areaId?: string;
    areaIds?: string[];
    search?: string;
    /** Override candidate head; defaults to min(PLATFORM_SCAN, CAP). */
    limit?: number;
  }
): Promise<ZeroSalesSkuCandidate[]> {
  const { filters, params } = buildZeroSalesSkuFilters(args);
  const limit = Math.min(PLATFORM_SCAN_LIMIT, Math.max(1, args.limit ?? ZERO_SALES_SKUS_CACHE_CAP));
  return (await prisma.$queryRawUnsafe(
    `SELECT ${ZERO_SALES_SKU_CANDIDATE_SELECT}
     FROM "ContentPackage" cp
     WHERE ${filters.join(' AND ')}
     ORDER BY cp."packageId" ASC
     LIMIT ?`,
    ...params,
    String(limit)
  )) as ZeroSalesSkuCandidate[];
}

/**
 * Batch last-sale + 30d GMV/qty for candidate package ids.
 * Single PackageSalesDaily group-by per IN-chunk (no per-row correlated subqueries).
 * lastSaleFrom bounds history; start30d drives 30d sums via CASE.
 */
export type ZeroSalesSkuMetrics = {
  lastSalesDate: string | null;
  staleGmv30d: number;
  staleSalesQty30d: number;
};

export async function loadZeroSalesSkuMetricsByPackage(
  prisma: PrismaService,
  packageIds: string[],
  start30d: string,
  lastSaleFrom: string
): Promise<Map<string, ZeroSalesSkuMetrics>> {
  const m = new Map<string, ZeroSalesSkuMetrics>();
  if (!packageIds.length) return m;
  const rows = await queryInChunks(packageIds, async (chunk) => {
    // Param order: start30d (gmv CASE), start30d (qty CASE), lastSaleFrom, packageIds…
    return (await prisma.$queryRawUnsafe(
      `SELECT
         s."packageId" AS "packageId",
         MAX(s."date") AS "lastSalesDate",
         COALESCE(SUM(CASE WHEN s."date" >= ? THEN s."salesAmountFen" ELSE 0 END), 0) / 100.0 AS "staleGmv30d",
         COALESCE(SUM(CASE WHEN s."date" >= ? THEN s."salesQty" ELSE 0 END), 0) AS "staleSalesQty30d"
       FROM "PackageSalesDaily" s
       WHERE s."packageId" IN (${chunk.map(() => '?').join(',')})
         AND s."salesQty" > 0
         AND s."date" >= ?
       GROUP BY s."packageId"`,
      start30d,
      start30d,
      ...chunk,
      lastSaleFrom
    )) as Array<{
      packageId: string;
      lastSalesDate: string | null;
      staleGmv30d: number;
      staleSalesQty30d: number;
    }>;
  });
  for (const r of rows) {
    m.set(r.packageId, {
      lastSalesDate: r.lastSalesDate,
      staleGmv30d: Number(r.staleGmv30d),
      staleSalesQty30d: Number(r.staleSalesQty30d)
    });
  }
  return m;
}

/** daysSinceLastSale — null last sale → 9999 (never sold / beyond lookback). */
export function zeroSalesDaysSince(today: string, last: string | null): number {
  if (!last) return 9999;
  return Math.floor(
    (Date.parse(today + 'T00:00:00Z') - Date.parse(last + 'T00:00:00Z')) / 86400000
  );
}

export function mapZeroSalesSkuCandidates(
  candidates: ZeroSalesSkuCandidate[],
  metrics: Map<string, ZeroSalesSkuMetrics>,
  today: string
): ZeroSalesSkuRow[] {
  return candidates.map((c) => {
    const m = metrics.get(c.packageId);
    const last = m?.lastSalesDate ?? null;
    return {
      packageId: c.packageId,
      packageName: c.packageName,
      merchantId: c.merchantId,
      merchantName: c.merchantName,
      areaName: c.areaName,
      category: c.category,
      salePrice: Number(c.salePriceFen ?? 0) / 100,
      stockLeft: Number(c.stockLeft),
      stockTotal: Number(c.stockTotal),
      lastSalesDate: last,
      daysSinceLastSale: zeroSalesDaysSince(today, last),
      staleGmv30d: Number(m?.staleGmv30d ?? 0),
      staleSalesQty30d: Number(m?.staleSalesQty30d ?? 0)
    };
  });
}

/**
 * JS sort for zero-sales SKU head:
 * lastSalesDateAsc / staleDesc → nulls first, then oldest last-sale;
 * gmvDesc → highest 30d GMV.
 * Stable packageId tie-break.
 */
export function sortZeroSalesSkuRows(
  rows: ZeroSalesSkuRow[],
  sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc'
): void {
  if (sort === 'gmvDesc') {
    rows.sort((a, b) => b.staleGmv30d - a.staleGmv30d || a.packageId.localeCompare(b.packageId));
    return;
  }
  // lastSalesDateAsc + staleDesc (larger daysSince = older lastSalesDate / nulls first)
  rows.sort((a, b) => {
    const ad = a.daysSinceLastSale ?? 9999;
    const bd = b.daysSinceLastSale ?? 9999;
    return bd - ad || a.packageId.localeCompare(b.packageId);
  });
}

/**
 * Movement-style zero-sales SKU head:
 *   1. filter-first candidates ORDER BY packageId LIMIT CAP
 *   2. batch last-sale + 30d metrics (queryInChunks)
 *   3. JS map + sort → ≤ limit rows
 * Avoids correlated ORDER BY lastSalesDate/staleGmv before LIMIT which forced
 * full-filter evaluation of every matching zero-sales package.
 */
export async function queryAllZeroSalesSkuRows(
  prisma: PrismaService,
  args: {
    today: string;
    start30d: string;
    threshold: string;
    merchantId?: string;
    merchantIds?: string[];
    category?: string;
    areaId?: string;
    areaIds?: string[];
    search?: string;
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
    limit: number;
    /** Optional last-sale history bound; defaults to start30d (safe under zero-sales filter). */
    lastSaleFrom?: string;
  }
): Promise<ZeroSalesSkuRow[]> {
  const limit = Math.min(PLATFORM_SCAN_LIMIT, Math.max(1, args.limit || ZERO_SALES_SKUS_CACHE_CAP));
  const candidates = await loadZeroSalesSkuCandidates(prisma, {
    threshold: args.threshold,
    merchantId: args.merchantId,
    merchantIds: args.merchantIds,
    category: args.category,
    areaId: args.areaId,
    areaIds: args.areaIds,
    search: args.search,
    limit
  });
  if (!candidates.length) return [];
  const lastSaleFrom = args.lastSaleFrom ?? args.start30d;
  const metrics = await loadZeroSalesSkuMetricsByPackage(
    prisma,
    candidates.map((c) => c.packageId),
    args.start30d,
    lastSaleFrom
  );
  const rows = mapZeroSalesSkuCandidates(candidates, metrics, args.today);
  sortZeroSalesSkuRows(rows, args.sort);
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

/** Page-oriented wrapper — head query + in-memory slice. */
export async function queryZeroSalesSkuRows(
  prisma: PrismaService,
  args: {
    today: string;
    start30d: string;
    threshold: string;
    merchantId?: string;
    merchantIds?: string[];
    category?: string;
    areaId?: string;
    areaIds?: string[];
    search?: string;
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
    page: number;
    pageSize: number;
  }
): Promise<ZeroSalesSkuRow[]> {
  const offset = (args.page - 1) * args.pageSize;
  // 90d last-sale bound (parity with computeZeroSalesSkus stale60+30).
  const lastSaleFrom = shiftDateKey(args.today, -90);
  const all = await queryAllZeroSalesSkuRows(prisma, {
    ...args,
    lastSaleFrom,
    limit: Math.min(ZERO_SALES_SKUS_CACHE_CAP, offset + args.pageSize)
  });
  return all.slice(offset, offset + args.pageSize);
}
