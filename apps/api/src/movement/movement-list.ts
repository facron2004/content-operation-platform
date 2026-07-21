import { beijingDateKey, shiftDateKey } from '@content/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { MovementSkusQueryDto } from './movement.dto';
import { assembleSkuRows, fetchMovingPackageIds, loadActiveSkus } from './movement-skus';
import { staleDaysFromBucket } from './movement-stale';

export async function listMovingSkus(
  prisma: PrismaService,
  params: {
    days: 1 | 7 | 30;
    page: number;
    pageSize: number;
    merchantId?: string;
    category?: string;
    areaId?: string;
    search?: string;
  }
) {
  const today = beijingDateKey(new Date());
  const start = shiftDateKey(today, -(params.days - 1));
  const candidates = await loadActiveSkus(prisma, params);
  const pkgIds = candidates.map((c) => c.packageId);
  const empty = {
    items: [],
    pagination: { hasMore: false, page: params.page, pageSize: params.pageSize }
  };
  if (!pkgIds.length) return empty;
  const movingSet = await fetchMovingPackageIds(prisma, pkgIds, start, today);
  const movingIds = pkgIds.filter((id) => movingSet.has(id));
  if (!movingIds.length) return empty;
  return assembleSkuRows(prisma, {
    candidates,
    filterPackageIds: movingIds,
    sort: 'gmvDesc',
    page: params.page,
    pageSize: params.pageSize
  });
}

export async function listStagnantSkus(prisma: PrismaService, q: MovementSkusQueryDto) {
  const today = beijingDateKey(new Date());
  const days = staleDaysFromBucket(q.bucket);
  const start = shiftDateKey(today, -(days - 1));
  const candidates = await loadActiveSkus(prisma, q);
  const pkgIds = candidates.map((c) => c.packageId);
  const empty = { items: [], pagination: { hasMore: false, page: q.page, pageSize: q.pageSize } };
  if (!pkgIds.length) return empty;
  const movingIds = await fetchMovingPackageIds(prisma, pkgIds, start, today);
  const stagnantIds = pkgIds.filter((id) => !movingIds.has(id));
  if (!stagnantIds.length) return empty;
  return assembleSkuRows(prisma, {
    candidates,
    filterPackageIds: stagnantIds,
    sort: q.sort,
    page: q.page,
    pageSize: q.pageSize
  });
}
