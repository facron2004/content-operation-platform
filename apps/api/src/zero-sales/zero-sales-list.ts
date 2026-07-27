/** Consolidated zero-sales module. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import {
  clampListPage,
  clampListPageSize,
  CSV_EXPORT_MAX_ROWS,
  DATA_ANALYSIS_OH_CONCURRENCY,
  mapPool,
  ZERO_SALES_MERCHANTS_CACHE_CAP,
  ZERO_SALES_SKUS_CACHE_CAP
} from '../common/sql-chunk';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { PrismaService } from '../prisma/prisma.service';
import {
  bucketFromDays,
  groupCandidatesByMerchant,
  loadStaleCandidates,
  staleDaysFromBucket
} from './zero-sales-candidates';
import {
  loadGmvByPackage,
  loadLastSalesByPackage,
  loadTotalSkuByMerchant,
  queryAllZeroSalesSkuRows
} from './zero-sales-loaders';
import {
  type MerchantAcc,
  type ZeroSalesSkuRow,
  ZeroSalesMerchantsQueryDto,
  ZeroSalesSkusQueryDto
} from './zero-sales.dto';

export type ZeroSalesMerchantRow = {
  merchantId: string;
  merchantName: string;
  areaName: string | null | undefined;
  areaId: string | null | undefined;
  totalSku: number;
  staleSkuCount: number;
  staleGmv30d: number;
  lastSalesDate: string | null;
};

// --- zero-sales-merchant-rows.ts ---
/** Build + sort full merchant rows. Pagination is applied by the caller so TTL cache can share one scan. */
export function buildZeroSalesMerchantRows(o: {
  byMerchant: Map<string, MerchantAcc>;
  gmvByPackage: Map<string, number>;
  lastSalesByPackage: Map<string, string>;
  totalSkuByMerchant: Map<string, number>;
  today: string;
}): ZeroSalesMerchantRow[] {
  const gmvByM = new Map<string, number>(),
    lastByM = new Map<string, string>();
  for (const m of o.byMerchant.values()) {
    let sum = 0,
      last: string | null = null;
    for (const pid of m.packageIds) {
      sum += o.gmvByPackage.get(pid) ?? 0;
      const pl = o.lastSalesByPackage.get(pid);
      if (pl && (!last || pl > last)) last = pl;
    }
    gmvByM.set(m.merchantId, sum);
    if (last) lastByM.set(m.merchantId, last);
  }
  return [...o.byMerchant.values()]
    .map((m) => ({
      merchantId: m.merchantId,
      merchantName: m.merchantName,
      areaName: m.areaName,
      areaId: m.areaId,
      totalSku: o.totalSkuByMerchant.get(m.merchantId) ?? 0,
      staleSkuCount: m.packageIds.length,
      staleGmv30d: gmvByM.get(m.merchantId) ?? 0,
      lastSalesDate: lastByM.get(m.merchantId) ?? null
    }))
    .sort((a, b) => b.staleSkuCount - a.staleSkuCount || a.merchantId.localeCompare(b.merchantId));
}

export function paginateZeroSalesMerchants(
  rows: ZeroSalesMerchantRow[],
  page: number,
  pageSize: number
) {
  // Defense-in-depth: DTO Max may be bypassed if pipe is misconfigured.
  const safePage = clampListPage(page, 100);
  const safePageSize = clampListPageSize(pageSize, 200, 20);
  const offset = (safePage - 1) * safePageSize;
  // Residual #266: total is head-window size (≤ ZERO_SALES_MERCHANTS_CACHE_CAP).
  const limit = ZERO_SALES_MERCHANTS_CACHE_CAP;
  return {
    items: rows.slice(offset, offset + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      hasMore: offset + safePageSize < rows.length,
      total: rows.length
    },
    limit,
    truncated: rows.length >= limit
  };
}

/** Stable cache key for the full zero-sales merchant aggregate (page excluded). */
export function zeroSalesMerchantsCacheKey(q: ZeroSalesMerchantsQueryDto, today: string): string {
  const areaIds = [...(q.areaIds ?? [])].sort();
  const merchantIds = [...(q.merchantIds ?? [])].sort();
  return [
    'zero-sales:merchants',
    today,
    q.staleBucket ?? 'stale_30d',
    q.merchantId ?? '',
    q.areaId ?? '',
    q.search ?? '',
    areaIds.join(','),
    merchantIds.join(',')
  ].join('|');
}

// --- zero-sales-list-map.ts ---
export function mapZeroSalesSkuRows(
  rows: ZeroSalesSkuRow[],
  rules: typeof DEFAULT_INVENTORY_RULES
) {
  return rows.map((r) => {
    const d = r.daysSinceLastSale ?? 9999;
    return {
      packageId: r.packageId,
      packageName: r.packageName,
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      areaName: r.areaName,
      category: r.category,
      salePrice: Number(r.salePrice),
      stockLeft: Number(r.stockLeft),
      stockTotal: Number(r.stockTotal),
      lastSalesDate: r.lastSalesDate,
      daysSinceLastSale: d,
      staleBucket: bucketFromDays(d, rules),
      staleGmv30d: Number(r.staleGmv30d),
      staleSalesQty30d: Number(r.staleSalesQty30d)
    };
  });
}

// --- zero-sales-list-merchants.ts ---
/** Full aggregate (sorted). Page is applied by listZeroSalesMerchants / service cache. */
export async function computeZeroSalesMerchants(
  prisma: PrismaService,
  q: ZeroSalesMerchantsQueryDto,
  today = beijingDateKey(new Date())
): Promise<ZeroSalesMerchantRow[]> {
  const days = staleDaysFromBucket(q.staleBucket, DEFAULT_INVENTORY_RULES);
  const staleThreshold = shiftDateKey(today, -(days - 1));
  const filteredCandidates = await loadStaleCandidates(prisma, q, staleThreshold);
  const byMerchant = groupCandidatesByMerchant(filteredCandidates);
  const filteredIds = filteredCandidates.map((c) => c.packageId);
  // Bound last-sale scan to stale60 lookback — older history only grows SQLite work
  // and zero-sales merchants already filter candidates by the request bucket.
  const lastSaleFrom = shiftDateKey(today, -(DEFAULT_INVENTORY_RULES.stale60Days + 30));
  // Cap concurrent PackageSalesDaily / ContentPackage scans (parity data-analysis
  // OH pool). Unbounded 3-way Promise.all storms SQLite under cold multi-tab hits
  // even though each loader already chunk-pools its own IN lists.
  const merchantIds = [...byMerchant.keys()];
  // Heterogeneous job returns → Promise<unknown> then cast (mapPool is order-preserving).
  const enrichJobs: Array<() => Promise<unknown>> = [
    () => loadGmvByPackage(prisma, filteredIds, staleThreshold),
    () => loadLastSalesByPackage(prisma, filteredIds, lastSaleFrom),
    () => loadTotalSkuByMerchant(prisma, merchantIds)
  ];
  const enrichParts = await mapPool(enrichJobs, DATA_ANALYSIS_OH_CONCURRENCY, (job) => job());
  const gmvByPackage = enrichParts[0] as Awaited<ReturnType<typeof loadGmvByPackage>>;
  const lastSalesByPackage = enrichParts[1] as Awaited<ReturnType<typeof loadLastSalesByPackage>>;
  const totalSkuByMerchant = enrichParts[2] as Awaited<ReturnType<typeof loadTotalSkuByMerchant>>;
  const rows = buildZeroSalesMerchantRows({
    byMerchant,
    gmvByPackage,
    lastSalesByPackage,
    totalSkuByMerchant,
    today
  });
  // Bound TTL-cached aggregate (parity with MOVEMENT_CACHE_CAP).
  return rows.length <= ZERO_SALES_MERCHANTS_CACHE_CAP
    ? rows
    : rows.slice(0, ZERO_SALES_MERCHANTS_CACHE_CAP);
}

export async function listZeroSalesMerchants(prisma: PrismaService, q: ZeroSalesMerchantsQueryDto) {
  const rows = await computeZeroSalesMerchants(prisma, q);
  return paginateZeroSalesMerchants(rows, q.page, q.pageSize);
}

/**
 * Cache key for the sorted zero-sales SKU head (page excluded).
 * Page flips slice the cached head in memory — no re-run of correlated SQL.
 */
export function zeroSalesSkusCacheKey(q: ZeroSalesSkusQueryDto, today: string): string {
  const areaIds = [...(q.areaIds ?? [])].sort();
  const merchantIds = [...(q.merchantIds ?? [])].sort();
  return [
    'zero-sales:skus',
    today,
    q.staleBucket ?? 'stale_7d',
    q.sort ?? 'lastSalesDateAsc',
    q.merchantId ?? '',
    q.areaId ?? '',
    q.category ?? '',
    q.search ?? '',
    areaIds.join(','),
    merchantIds.join(',')
  ].join('|');
}

export type ZeroSalesSkuItem = ReturnType<typeof mapZeroSalesSkuRows>[number];

export type ZeroSalesSkusPage = {
  items: ZeroSalesSkuItem[];
  pagination: { page: number; pageSize: number; hasMore: boolean; total: number };
  // Residual #266: cache-head LIMIT honesty.
  limit: number;
  truncated: boolean;
};

/** Slice a cached SKU head into a page (export uses pageSize ≤ CAP). */
export function paginateZeroSalesSkus(
  rows: ZeroSalesSkuItem[],
  page: number,
  pageSize: number
): ZeroSalesSkusPage {
  // Export may request up to CSV_EXPORT_MAX_ROWS (= CAP); interactive DTO Max is 200.
  // Clamp page so offset stays inside the head window — deep DTO pages must not
  // silently empty while total still reports head length as if more existed.
  const safePageSize = clampListPageSize(pageSize, CSV_EXPORT_MAX_ROWS, 50);
  const maxPage = Math.max(1, Math.ceil(ZERO_SALES_SKUS_CACHE_CAP / safePageSize));
  const safePage = Math.min(clampListPage(page, 100), maxPage);
  const offset = (safePage - 1) * safePageSize;
  // Residual #266: total is head-window size (≤ ZERO_SALES_SKUS_CACHE_CAP).
  const limit = ZERO_SALES_SKUS_CACHE_CAP;
  return {
    items: rows.slice(offset, offset + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      hasMore: offset + safePageSize < rows.length,
      // total is head-window size (≤ CAP), not full catalog cardinality.
      total: rows.length
    },
    limit,
    truncated: rows.length >= limit
  };
}

/**
 * Sorted zero-sales SKU head (≤ ZERO_SALES_SKUS_CACHE_CAP). Page is applied by
 * listZeroSalesSkus / service cache so page flips share one candidate+enrich scan.
 * Movement-style: cheap packageId-ordered candidates → batch metrics → JS sort.
 */
export async function computeZeroSalesSkus(
  prisma: PrismaService,
  q: ZeroSalesSkusQueryDto,
  today = beijingDateKey(new Date())
): Promise<ZeroSalesSkuItem[]> {
  const rules = DEFAULT_INVENTORY_RULES;
  const days = q.staleBucket ? staleDaysFromBucket(q.staleBucket, rules) : rules.stale7Days,
    threshold = shiftDateKey(today, -(days - 1)),
    start30d = shiftDateKey(today, -29),
    // Bound last-sale history (parity with merchants path). Unbounded MAX over
    // full PackageSalesDaily history grows with retention; stale60+30 covers
    // every interactive stale bucket with headroom for daysSince display.
    lastSaleFrom = shiftDateKey(today, -(rules.stale60Days + 30));
  const rows = await queryAllZeroSalesSkuRows(prisma, {
    today,
    start30d,
    threshold,
    lastSaleFrom,
    merchantId: q.merchantId,
    merchantIds: q.merchantIds,
    category: q.category,
    areaId: q.areaId,
    areaIds: q.areaIds,
    search: q.search,
    sort: q.sort,
    limit: ZERO_SALES_SKUS_CACHE_CAP
  });
  return mapZeroSalesSkuRows(rows, rules);
}

/** @deprecated Prefer computeZeroSalesSkus + paginateZeroSalesSkus (page-less cache). */
export async function computeZeroSalesSkusPage(
  prisma: PrismaService,
  q: ZeroSalesSkusQueryDto,
  today = beijingDateKey(new Date())
): Promise<ZeroSalesSkusPage> {
  const rows = await computeZeroSalesSkus(prisma, q, today);
  return paginateZeroSalesSkus(rows, q.page, q.pageSize);
}

// --- zero-sales-list-skus.ts ---
export async function listZeroSalesSkus(prisma: PrismaService, q: ZeroSalesSkusQueryDto) {
  const rows = await computeZeroSalesSkus(prisma, q);
  return paginateZeroSalesSkus(rows, q.page, q.pageSize);
}
