import { beijingDateKey, shiftDateKey } from '@content/shared';
import { MOVEMENT_CACHE_CAP } from '../common/sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';
import type { MovementSkusQueryDto } from './movement.dto';
import type { MovementSkuRow } from './movement.types';
import { computeSkuRows, loadActiveSkus, paginateMovementSkuRows } from './movement-skus';
import { staleDaysFromBucket } from './movement-stale';

/** Bound TTL-cached aggregates after sort (export pageSize ≤ CSV_EXPORT_MAX_ROWS ≤ cap). */
function capMovementRows(rows: MovementSkuRow[]): MovementSkuRow[] {
  return rows.length <= MOVEMENT_CACHE_CAP ? rows : rows.slice(0, MOVEMENT_CACHE_CAP);
}

type ScopeFilters = {
  merchantId?: string;
  merchantIds?: string[];
  category?: string;
  areaId?: string;
  areaIds?: string[];
  search?: string;
};

function scopeKey(q: ScopeFilters): string {
  const areaIds = [...(q.areaIds ?? [])].sort().join(',');
  const merchantIds = [...(q.merchantIds ?? [])].sort().join(',');
  return [
    q.merchantId ?? '',
    merchantIds,
    q.category ?? '',
    q.areaId ?? '',
    areaIds,
    q.search ?? ''
  ].join('|');
}

/** Aggregate cache key — page/pageSize intentionally excluded. */
export function movingSkusCacheKey(
  params: ScopeFilters & { days: 1 | 7 | 30 },
  today: string
): string {
  return ['movement:moving', today, String(params.days), scopeKey(params)].join('|');
}

/** Aggregate cache key — page/pageSize intentionally excluded. */
export function stagnantSkusCacheKey(q: MovementSkusQueryDto, today: string): string {
  return [
    'movement:stagnant',
    today,
    q.bucket ?? 'stale_30d',
    q.sort ?? 'lastSalesDateAsc',
    scopeKey(q)
  ].join('|');
}

/**
 * Full sorted moving SKU aggregate (no page).
 * Membership is filter-first in SQL (EXISTS sales in window) — no 10k candidate
 * materialize + second DISTINCT PackageSalesDaily pass.
 */
export async function computeMovingSkus(
  prisma: PrismaService,
  params: ScopeFilters & { days: 1 | 7 | 30 },
  today = beijingDateKey(new Date())
): Promise<MovementSkuRow[]> {
  const start = shiftDateKey(today, -(params.days - 1));
  const candidates = await loadActiveSkus(prisma, {
    ...params,
    salesWindow: { mode: 'moving', start, today }
  });
  if (!candidates.length) return [];
  const movingIds = candidates.map((c) => c.packageId);
  const rows = await computeSkuRows(prisma, {
    candidates,
    filterPackageIds: movingIds,
    sort: 'gmvDesc'
  });
  return capMovementRows(rows);
}

/**
 * Full sorted stagnant SKU aggregate (no page).
 * Membership is filter-first in SQL (NOT EXISTS sales in window).
 */
export async function computeStagnantSkus(
  prisma: PrismaService,
  q: MovementSkusQueryDto,
  today = beijingDateKey(new Date())
): Promise<MovementSkuRow[]> {
  const days = staleDaysFromBucket(q.bucket);
  const start = shiftDateKey(today, -(days - 1));
  const candidates = await loadActiveSkus(prisma, {
    ...q,
    salesWindow: { mode: 'stagnant', start, today }
  });
  if (!candidates.length) return [];
  const stagnantIds = candidates.map((c) => c.packageId);
  const rows = await computeSkuRows(prisma, {
    candidates,
    filterPackageIds: stagnantIds,
    sort: q.sort
  });
  return capMovementRows(rows);
}

export async function listMovingSkus(
  prisma: PrismaService,
  params: {
    days: 1 | 7 | 30;
    page: number;
    pageSize: number;
    merchantId?: string;
    merchantIds?: string[];
    category?: string;
    areaId?: string;
    areaIds?: string[];
    search?: string;
  }
) {
  const rows = await computeMovingSkus(prisma, params);
  return paginateMovementSkuRows(rows, params.page, params.pageSize);
}

export async function listStagnantSkus(prisma: PrismaService, q: MovementSkusQueryDto) {
  const rows = await computeStagnantSkus(prisma, q);
  return paginateMovementSkuRows(rows, q.page, q.pageSize);
}
