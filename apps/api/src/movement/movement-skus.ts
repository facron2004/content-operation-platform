import { beijingDateKey, shiftDateKey } from '@content/shared';
import { likeContains, sanitizeContainsSearch } from '../common/like-escape';
import {
  clampListPage,
  clampListPageSize,
  CSV_EXPORT_MAX_ROWS,
  MOVEMENT_CACHE_CAP,
  PLATFORM_SCAN_LIMIT,
  queryInChunks
} from '../common/sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';
import type { ActiveSkuCandidate, MovementSkuRow } from './movement.types';
import { daysSince, staleBucketFromDays } from './movement-stale';

const ACTIVE_SKU_SELECT_SQL = `
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

function buildActiveSkuFilters(q: {
  merchantId?: string;
  merchantIds?: string[];
  category?: string;
  areaId?: string;
  areaIds?: string[];
  search?: string;
}): { filters: string[]; params: string[] } {
  const filters: string[] = ['cp."stockLeft" > 0'];
  const params: string[] = [];
  if (q.merchantIds?.length) {
    const merchantIds = q.merchantIds.slice(0, 200);
    filters.push(`cp."merchantId" IN (${merchantIds.map(() => '?').join(',')})`);
    params.push(...merchantIds);
  } else if (q.merchantId) {
    filters.push('cp."merchantId" = ?');
    params.push(q.merchantId);
  }
  if (q.category) {
    filters.push('cp."category" = ?');
    params.push(q.category);
  }
  if (q.areaIds?.length) {
    const areaIds = q.areaIds.slice(0, 200);
    filters.push(`cp."areaId" IN (${areaIds.map(() => '?').join(',')})`);
    params.push(...areaIds);
  } else if (q.areaId) {
    filters.push('cp."areaId" = ?');
    params.push(q.areaId);
  }
  const search = sanitizeContainsSearch(q.search);
  if (search) {
    filters.push(`(cp."packageName" LIKE ? ESCAPE '\\' OR cp."merchantName" LIKE ? ESCAPE '\\')`);
    const kw = likeContains(search);
    params.push(kw, kw);
  }
  return { filters, params };
}

/**
 * Optional sales-window membership pushed into SQL (EXISTS / NOT EXISTS).
 * Avoids materializing all in-stock candidates then filtering via a second
 * PackageSalesDaily DISTINCT pass (computeMoving/Stagnant cold path).
 */
export type ActiveSkuSalesWindow = {
  mode: 'moving' | 'stagnant';
  start: string;
  today: string;
};

/**
 * Load in-stock SKU candidates with early LIMIT.
 * Cap at min(PLATFORM_SCAN, MOVEMENT_CACHE_CAP) so cold paths never hold 10k
 * fat rows before membership filter + sort (previous post-work cap).
 * When `salesWindow` is set, membership is filter-first in SQL.
 */
export async function loadActiveSkus(
  prisma: PrismaService,
  q: {
    merchantId?: string;
    merchantIds?: string[];
    category?: string;
    areaId?: string;
    areaIds?: string[];
    search?: string;
    salesWindow?: ActiveSkuSalesWindow;
  }
): Promise<ActiveSkuCandidate[]> {
  const limit = Math.min(PLATFORM_SCAN_LIMIT, MOVEMENT_CACHE_CAP);

  const membershipSql = (window?: ActiveSkuSalesWindow): { sql: string; params: string[] } => {
    if (!window) return { sql: '', params: [] };
    const predicate = `EXISTS (
      SELECT 1 FROM "PackageSalesDaily" s
      WHERE s."packageId" = cp."packageId"
        AND s."salesQty" > 0
        AND s."date" >= ?
        AND s."date" <= ?
    )`;
    const sql = window.mode === 'moving' ? `AND ${predicate}` : `AND NOT ${predicate}`;
    return { sql, params: [window.start, window.today] };
  };

  const selectSql = (filtersSql: string, membership: string) => `
    SELECT ${ACTIVE_SKU_SELECT_SQL}
    FROM "ContentPackage" cp
    WHERE ${filtersSql}
    ${membership}
    ORDER BY cp."packageId" ASC
    LIMIT ?
  `;

  const run = async (scopeQ: typeof q): Promise<ActiveSkuCandidate[]> => {
    const { filters, params } = buildActiveSkuFilters(scopeQ);
    const mem = membershipSql(scopeQ.salesWindow);
    return (await prisma.$queryRawUnsafe(
      selectSql(filters.join(' AND '), mem.sql),
      ...params,
      ...mem.params,
      String(limit)
    )) as ActiveSkuCandidate[];
  };

  // Multi-merchant scope may exceed DEFAULT_IN_CHUNK — chunk + re-cap.
  if (q.merchantIds && q.merchantIds.length > 500) {
    const base = { ...q, merchantIds: undefined as string[] | undefined };
    const rows = await queryInChunks(q.merchantIds.slice(0, 200), (chunk) =>
      run({ ...base, merchantIds: chunk })
    );
    return rows.length > limit ? rows.slice(0, limit) : rows;
  }

  // Multi-area scope without merchantIds — chunk areaIds if large.
  if (q.areaIds && q.areaIds.length > 500 && !q.merchantIds?.length && !q.merchantId) {
    const base = { ...q, areaIds: undefined as string[] | undefined };
    const rows = await queryInChunks(q.areaIds.slice(0, 200), (chunk) =>
      run({ ...base, areaIds: chunk })
    );
    return rows.length > limit ? rows.slice(0, limit) : rows;
  }

  return run(q);
}

export async function fetchMovingPackageIds(
  prisma: PrismaService,
  pkgIds: string[],
  start: string,
  today: string
): Promise<Set<string>> {
  if (!pkgIds.length) return new Set();
  const rows = await queryInChunks(pkgIds, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(',');
    return (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT "packageId" FROM "PackageSalesDaily" WHERE "salesQty" > 0 AND "date" >= ? AND "date" <= ? AND "packageId" IN (${placeholders})`,
      start,
      today,
      ...chunk
    )) as Array<{ packageId: string }>;
  });
  return new Set(rows.map((r) => r.packageId));
}

export async function loadRecentSalesByPackage(prisma: PrismaService, filterPackageIds: string[]) {
  const today = beijingDateKey(new Date());
  const start = shiftDateKey(today, -29);
  const recentRows = await queryInChunks(filterPackageIds, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(',');
    return (await prisma.$queryRawUnsafe(
      `SELECT "packageId", COALESCE(SUM("salesQty"), 0) AS "salesQty", COALESCE(SUM("salesAmountFen"), 0) AS "salesAmountFen", MAX("date") AS "lastSalesDate" FROM "PackageSalesDaily" WHERE "salesQty" > 0 AND "date" >= ? AND "date" <= ? AND "packageId" IN (${placeholders}) GROUP BY "packageId"`,
      start,
      today,
      ...chunk
    )) as Array<{
      packageId: string;
      salesQty: number;
      salesAmountFen: bigint | null;
      lastSalesDate: string | null;
    }>;
  });
  return { today, recentMap: new Map(recentRows.map((r) => [r.packageId, r])) };
}

export function mapMovementSkuRows(
  filterPackageIds: string[],
  candidateMap: Map<string, ActiveSkuCandidate>,
  recentMap: Map<
    string,
    { salesQty: number; salesAmountFen: bigint | null; lastSalesDate: string | null }
  >,
  today: string
): MovementSkuRow[] {
  return filterPackageIds.map((pkgId) => {
    const c = candidateMap.get(pkgId)!;
    const r = recentMap.get(pkgId);
    const last = r?.lastSalesDate ?? null;
    const days = daysSince(today, last);
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
      daysSinceLastSale: days,
      staleBucket: staleBucketFromDays(days),
      recent30dSalesQty: Number(r?.salesQty ?? 0),
      recent30dSalesAmount: Number(r?.salesAmountFen ?? 0) / 100
    };
  });
}

export function sortMovementSkuRows(
  rows: MovementSkuRow[],
  sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc'
): void {
  if (sort === 'lastSalesDateAsc') {
    rows.sort((a, b) => {
      if (!a.lastSalesDate && !b.lastSalesDate) return 0;
      if (!a.lastSalesDate) return -1;
      if (!b.lastSalesDate) return 1;
      return Date.parse(a.lastSalesDate) - Date.parse(b.lastSalesDate);
    });
    return;
  }
  if (sort === 'staleDesc') {
    rows.sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);
    return;
  }
  rows.sort((a, b) => b.recent30dSalesAmount - a.recent30dSalesAmount);
}

export async function assembleSkuRows(
  prisma: PrismaService,
  args: {
    candidates: ActiveSkuCandidate[];
    filterPackageIds: string[];
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
    page: number;
    pageSize: number;
  }
): Promise<{
  items: MovementSkuRow[];
  pagination: { hasMore: boolean; page: number; pageSize: number; total: number };
}> {
  const allRows = await computeSkuRows(prisma, {
    candidates: args.candidates,
    filterPackageIds: args.filterPackageIds,
    sort: args.sort
  });
  return paginateMovementSkuRows(allRows, args.page, args.pageSize);
}

/** Full sorted SKU rows — page is applied by the caller so a TTL cache can share one scan. */
export async function computeSkuRows(
  prisma: PrismaService,
  args: {
    candidates: ActiveSkuCandidate[];
    filterPackageIds: string[];
    sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  }
): Promise<MovementSkuRow[]> {
  const candidateMap = new Map(args.candidates.map((c) => [c.packageId, c]));
  const { today, recentMap } = await loadRecentSalesByPackage(prisma, args.filterPackageIds);
  const allRows = mapMovementSkuRows(args.filterPackageIds, candidateMap, recentMap, today);
  sortMovementSkuRows(allRows, args.sort);
  return allRows;
}

export function paginateMovementSkuRows(rows: MovementSkuRow[], page: number, pageSize: number) {
  // Defense-in-depth: DTO Max / export callers may bypass pipe — never
  // slice more than CSV_EXPORT_MAX_ROWS into a single response payload.
  const safePage = clampListPage(page, 100);
  const safePageSize = clampListPageSize(pageSize, CSV_EXPORT_MAX_ROWS, 20);
  const offset = (safePage - 1) * safePageSize;
  const paged = rows.slice(offset, offset + safePageSize);
  // Residual #266: total is head-window size (≤ MOVEMENT_CACHE_CAP), not full
  // catalog cardinality. Surface limit/truncated so SPA can warn.
  const limit = MOVEMENT_CACHE_CAP;
  return {
    items: paged,
    pagination: {
      hasMore: offset + safePageSize < rows.length,
      page: safePage,
      pageSize: safePageSize,
      total: rows.length
    },
    limit,
    truncated: rows.length >= limit
  };
}
