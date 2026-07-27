import type { PrismaService } from '../prisma/prisma.service';
import type { OverviewDistributionRow } from './overview.types';
import { aggregateStaleBucketStats } from './overview-stale';

/** Residual #288: Top-N head + honesty for /overview/distribution. */
export type OverviewDistributionPayload = {
  items: OverviewDistributionRow[];
  /** Requested Top-N head (OverviewDistributionQueryDto.limit). */
  limit: number;
  /**
   * Rows matched before head clip.
   * When truncated for area/category, this is `limit + 1` (LIMIT+1 probe — at-least, not exact COUNT).
   * For dim=stale the bucket set is fixed (≤5), so truncated is typically false and matched = items.length.
   */
  matched: number;
  truncated: boolean;
};

export async function loadDimDistribution(
  prisma: PrismaService,
  dim: 'area' | 'category',
  limit: number
): Promise<OverviewDistributionPayload> {
  const safeLimit = Math.max(1, Math.floor(limit) || 20);
  const col = dim === 'area' ? 'areaName' : 'category';
  // Residual #288: LIMIT+1 probe — exact truncated without COUNT(*), head stays Top-N.
  const raw = (await prisma.$queryRawUnsafe(
    `SELECT "${col}" AS "key", COUNT(*) AS "totalSku", COALESCE(SUM("stockLeft"), 0) AS "stockLeft" FROM "ContentPackage" WHERE "${col}" IS NOT NULL AND "${col}" <> '' GROUP BY "${col}" ORDER BY "totalSku" DESC LIMIT ?`,
    safeLimit + 1
  )) as Array<{ key: string; totalSku: number; stockLeft: number }>;
  const truncated = raw.length > safeLimit;
  const head = raw.slice(0, safeLimit);
  const items = head.map((r) => ({
    key: r.key,
    totalSku: Number(r.totalSku),
    stockLeft: Number(r.stockLeft)
  }));
  return {
    items,
    limit: safeLimit,
    matched: truncated ? safeLimit + 1 : items.length,
    truncated
  };
}

export async function loadOverviewDistribution(
  prisma: PrismaService,
  dim: 'area' | 'category' | 'stale',
  limit: number
): Promise<OverviewDistributionPayload> {
  const safeLimit = Math.max(1, Math.floor(limit) || 20);
  if (dim === 'area' || dim === 'category') return loadDimDistribution(prisma, dim, safeLimit);
  const stats = await aggregateStaleBucketStats(prisma);
  const all = (['stale_60d', 'stale_30d', 'stale_15d', 'stale_7d', 'normal'] as const)
    .map((bucket) => ({ key: bucket, totalSku: stats[bucket] ?? 0, stockLeft: 0 }))
    .filter((r) => r.totalSku > 0);
  const truncated = all.length > safeLimit;
  const items = all.slice(0, safeLimit);
  return {
    items,
    limit: safeLimit,
    matched: all.length,
    truncated
  };
}
