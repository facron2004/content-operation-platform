import type { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey } from '@content/shared';
import type { TtlCache } from '../common';
import { loadPlatformStaleBucketStats } from '../common/stale-bucket-stats';
import type { MovementTodayPayload } from './movement.types';
import type { StaleBucket } from './movement.dto';
import { STALE_BUCKET_ORDER } from './movement.types';

/**
 * Platform "movement today" KPIs without loading every packageId into memory.
 * Uses aggregate SQL only — previous path materialised all in-stock package ids
 * then issued multi-thousand-parameter IN lists (OOM / DoS under full catalog).
 */
export async function loadMovementToday(
  prisma: PrismaService,
  cache: TtlCache,
  date?: string
): Promise<MovementTodayPayload> {
  const cacheKey = `movToday:${date ?? 'today'}`;
  // Single-flight via getOrLoad — concurrent cold hits must not re-run full-catalog aggregates.
  return cache.getOrLoad(cacheKey, false, async () => {
    const today = date ?? beijingDateKey(new Date());

    const [activeRow] = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS "c" FROM "ContentPackage" WHERE "stockLeft" > 0`
    )) as Array<{ c: number }>;
    const activeSkus = Number(activeRow?.c ?? 0);

    const [movingRow] = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT psd."packageId") AS "c"
       FROM "PackageSalesDaily" psd
       INNER JOIN "ContentPackage" cp ON cp."packageId" = psd."packageId"
       WHERE cp."stockLeft" > 0
         AND psd."salesQty" > 0
         AND psd."date" = ?`,
      today
    )) as Array<{ c: number }>;
    const movingSkus = Number(movingRow?.c ?? 0);

    // Shared process cache with overview stale distribution — one full-catalog join per TTL.
    const stats = await loadPlatformStaleBucketStats(prisma, today);
    const bucketDistribution = STALE_BUCKET_ORDER.map((bucket) => ({
      bucket: bucket as StaleBucket,
      totalSku: stats[bucket as keyof typeof stats] ?? 0
    }));

    return {
      date: today,
      activeSkus,
      movingSkus,
      stagnantSkus: Math.max(0, activeSkus - movingSkus),
      movingRate: activeSkus > 0 ? movingSkus / activeSkus : 0,
      bucketDistribution,
      updatedAt: new Date().toISOString()
    };
  });
}
