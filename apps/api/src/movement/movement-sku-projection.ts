import {
  clampListPage,
  clampListPageSize,
  CSV_EXPORT_MAX_ROWS,
  MOVEMENT_CACHE_CAP
} from '../common/sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';
import type { ActiveSkuCandidate, MovementSkuRow } from './movement.types';
import { daysSince, staleBucketFromDays } from './movement-stale';
import { loadRecentSalesByPackage } from './movement-sku-loaders';

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
