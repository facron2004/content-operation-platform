import { beijingDateKey } from '@content/shared';
import { queryInChunks } from '../common/sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaleBucket } from './movement.dto';
import { STALE_BUCKET_ORDER, STALE_THRESHOLDS } from './movement.types';

export function daysSince(today: string, last: string | null): number {
  if (!last) return 9999;
  return Math.floor(
    (Date.parse(today + 'T00:00:00Z') - Date.parse(last + 'T00:00:00Z')) / 86400000
  );
}

export function staleBucketFromDays(days: number): StaleBucket {
  if (days >= STALE_THRESHOLDS.stale60Days) return 'stale_60d';
  if (days >= STALE_THRESHOLDS.stale30Days) return 'stale_30d';
  if (days >= STALE_THRESHOLDS.stale15Days) return 'stale_15d';
  if (days >= STALE_THRESHOLDS.stale7Days) return 'stale_7d';
  return 'normal';
}

export function staleDaysFromBucket(bucket: StaleBucket | undefined): number {
  if (!bucket || bucket === 'normal') return STALE_THRESHOLDS.stale7Days;
  if (bucket === 'stale_7d') return STALE_THRESHOLDS.stale7Days;
  if (bucket === 'stale_15d') return STALE_THRESHOLDS.stale15Days;
  if (bucket === 'stale_30d') return STALE_THRESHOLDS.stale30Days;
  return STALE_THRESHOLDS.stale60Days;
}

export async function computeBucketCounts(
  prisma: PrismaService,
  pkgIds: string[],
  today: string
): Promise<Record<StaleBucket, number>> {
  const counts: Record<StaleBucket, number> = {
    normal: 0,
    stale_7d: 0,
    stale_15d: 0,
    stale_30d: 0,
    stale_60d: 0
  };
  if (!pkgIds.length) return counts;
  const rows = await queryInChunks(pkgIds, async (chunk) => {
    const placeholders = chunk.map(() => '?').join(',');
    return (await prisma.$queryRawUnsafe(
      `SELECT "packageId", MAX("date") AS "lastSalesDate" FROM "PackageSalesDaily" WHERE "salesQty" > 0 AND "packageId" IN (${placeholders}) GROUP BY "packageId"`,
      ...chunk
    )) as Array<{ packageId: string; lastSalesDate: string | null }>;
  });
  const lastDate = new Map(rows.map((r) => [r.packageId, r.lastSalesDate]));
  for (const id of pkgIds) {
    counts[staleBucketFromDays(daysSince(today, lastDate.get(id) ?? null))] += 1;
  }
  return counts;
}

export async function computeBucketDistribution(
  prisma: PrismaService,
  pkgIds: string[]
): Promise<Array<{ bucket: StaleBucket; totalSku: number }>> {
  if (!pkgIds.length) return STALE_BUCKET_ORDER.map((bucket) => ({ bucket, totalSku: 0 }));
  const counts = await computeBucketCounts(prisma, pkgIds, beijingDateKey(new Date()));
  return STALE_BUCKET_ORDER.map((bucket) => ({ bucket, totalSku: counts[bucket] }));
}
