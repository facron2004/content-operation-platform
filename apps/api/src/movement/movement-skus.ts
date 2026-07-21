import { beijingDateKey, shiftDateKey } from '@content/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { ActiveSkuCandidate, MovementSkuRow } from './movement.types';
import { daysSince, staleBucketFromDays } from './movement-stale';

export async function loadActiveSkus(
  prisma: PrismaService,
  q: { merchantId?: string; category?: string; areaId?: string; search?: string }
): Promise<ActiveSkuCandidate[]> {
  const where: Record<string, unknown> = { stockLeft: { gt: 0 } };
  if (q.merchantId) where['merchantId'] = q.merchantId;
  if (q.category) where['category'] = q.category;
  if (q.areaId) where['areaId'] = q.areaId;
  if (q.search) {
    where['OR'] = [
      { packageName: { contains: q.search } },
      { merchantName: { contains: q.search } }
    ];
  }
  return (await prisma.contentPackage.findMany({
    where,
    select: {
      packageId: true,
      packageName: true,
      merchantId: true,
      merchantName: true,
      areaName: true,
      category: true,
      salePrice: true,
      stockLeft: true,
      stockTotal: true
    }
  })) as ActiveSkuCandidate[];
}

export async function fetchMovingPackageIds(
  prisma: PrismaService,
  pkgIds: string[],
  start: string,
  today: string
): Promise<Set<string>> {
  if (!pkgIds.length) return new Set();
  const placeholders = pkgIds.map(() => '?').join(',');
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT "packageId" FROM "PackageSalesDaily" WHERE "salesQty" > 0 AND "date" >= ? AND "date" <= ? AND "packageId" IN (${placeholders})`,
    start,
    today,
    ...pkgIds
  )) as Array<{ packageId: string }>;
  return new Set(rows.map((r) => r.packageId));
}

export async function loadRecentSalesByPackage(prisma: PrismaService, filterPackageIds: string[]) {
  const today = beijingDateKey(new Date());
  const start = shiftDateKey(today, -29);
  const placeholders = filterPackageIds.map(() => '?').join(',');
  const recentRows = filterPackageIds.length
    ? ((await prisma.$queryRawUnsafe(
        `SELECT "packageId", COALESCE(SUM("salesQty"), 0) AS "salesQty", COALESCE(SUM("salesAmount"), 0) AS "salesAmount", MAX("date") AS "lastSalesDate" FROM "PackageSalesDaily" WHERE "salesQty" > 0 AND "date" >= ? AND "date" <= ? AND "packageId" IN (${placeholders}) GROUP BY "packageId"`,
        start,
        today,
        ...filterPackageIds
      )) as Array<{
        packageId: string;
        salesQty: number;
        salesAmount: number;
        lastSalesDate: string | null;
      }>)
    : [];
  return { today, recentMap: new Map(recentRows.map((r) => [r.packageId, r])) };
}

export function mapMovementSkuRows(
  filterPackageIds: string[],
  candidateMap: Map<string, ActiveSkuCandidate>,
  recentMap: Map<string, { salesQty: number; salesAmount: number; lastSalesDate: string | null }>,
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
      salePrice: Number(c.salePrice),
      stockLeft: Number(c.stockLeft),
      stockTotal: Number(c.stockTotal),
      lastSalesDate: last,
      daysSinceLastSale: days,
      staleBucket: staleBucketFromDays(days),
      recent30dSalesQty: Number(r?.salesQty ?? 0),
      recent30dSalesAmount: Number(r?.salesAmount ?? 0)
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
  pagination: { hasMore: boolean; page: number; pageSize: number };
}> {
  const { candidates, filterPackageIds, sort, page, pageSize } = args;
  const candidateMap = new Map(candidates.map((c) => [c.packageId, c]));
  const { today, recentMap } = await loadRecentSalesByPackage(prisma, filterPackageIds);
  const allRows = mapMovementSkuRows(filterPackageIds, candidateMap, recentMap, today);
  sortMovementSkuRows(allRows, sort);
  const offset = (page - 1) * pageSize;
  const paged = allRows.slice(offset, offset + pageSize);
  return { items: paged, pagination: { hasMore: paged.length === pageSize, page, pageSize } };
}
