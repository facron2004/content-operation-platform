import type { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey } from '@content/shared';
import type { TtlCache } from '../common';
import { sqlDatetime } from '../common';
import {
  computePlatformStaleBucketStats,
  loadPlatformStaleBucketStats
} from '../common/stale-bucket-stats';
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
  date?: string,
  force = false
): Promise<MovementTodayPayload> {
  const cacheKey = `movToday:${date ?? 'today'}`;
  // Single-flight via getOrLoad — concurrent cold hits must not re-run full-catalog aggregates.
  return cache.getOrLoad(cacheKey, force, async () => {
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
    const stats = force
      ? await computePlatformStaleBucketStats(prisma, today)
      : await loadPlatformStaleBucketStats(prisma, today);
    const bucketDistribution = STALE_BUCKET_ORDER.map((bucket) => ({
      bucket: bucket as StaleBucket,
      totalSku: stats[bucket as keyof typeof stats] ?? 0
    }));

    const [sourceRow] = (await prisma.$queryRawUnsafe(
      `SELECT MAX("sourceUpdatedAt") AS "sourceUpdatedAt"
       FROM (
         SELECT MAX(${sqlDatetime('cp."updatedAt"')}) AS "sourceUpdatedAt"
         FROM "ContentPackage" cp
         WHERE cp."stockLeft" > 0
         UNION ALL
         SELECT MAX(${sqlDatetime('psd."updatedAt"')}) AS "sourceUpdatedAt"
         FROM "PackageSalesDaily" psd
         INNER JOIN "ContentPackage" cp ON cp."packageId" = psd."packageId"
         WHERE cp."stockLeft" > 0 AND psd."date" <= ?
       )`,
      today
    )) as Array<{ sourceUpdatedAt: string | Date | null }>;

    return {
      date: today,
      activeSkus,
      movingSkus,
      stagnantSkus: Math.max(0, activeSkus - movingSkus),
      movingRate: activeSkus > 0 ? movingSkus / activeSkus : 0,
      bucketDistribution,
      updatedAt: sourceUpdatedAtIso(sourceRow?.sourceUpdatedAt)
    };
  });
}

/** SQLite datetime() returns UTC without a zone suffix; normalize it for the API contract. */
function sourceUpdatedAtIso(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();

  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasZone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
