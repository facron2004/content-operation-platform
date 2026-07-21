import type { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey } from '@content/shared';
import type { TtlCache } from '../common';
import { fetchMovingPackageIds } from './movement-skus';
import { computeBucketDistribution } from './movement-stale';
import type { MovementTodayPayload } from './movement.types';

export async function loadMovementToday(
  prisma: PrismaService,
  cache: TtlCache,
  date?: string
): Promise<MovementTodayPayload> {
  const cacheKey = `movToday:${date ?? 'today'}`;
  const cached = cache.get<MovementTodayPayload>(cacheKey);
  if (cached) return cached;
  const today = date ?? beijingDateKey(new Date());
  const pkgs = await prisma.contentPackage.findMany({
    where: { stockLeft: { gt: 0 } },
    select: { packageId: true }
  });
  const pkgIds = pkgs.map((p: { packageId: string }) => p.packageId);
  const activeSkus = pkgIds.length;
  const movingSkus = (await fetchMovingPackageIds(prisma, pkgIds, today, today)).size;
  const payload: MovementTodayPayload = {
    date: today,
    activeSkus,
    movingSkus,
    stagnantSkus: activeSkus - movingSkus,
    movingRate: activeSkus > 0 ? movingSkus / activeSkus : 0,
    bucketDistribution: await computeBucketDistribution(prisma, pkgIds),
    updatedAt: new Date().toISOString()
  };
  cache.set(cacheKey, payload);
  return payload;
}
