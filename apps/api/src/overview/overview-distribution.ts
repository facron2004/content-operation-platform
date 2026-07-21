import type { PrismaService } from '../prisma/prisma.service';
import type { OverviewDistributionRow } from './overview.types';
import { aggregateStaleBucketStats } from './overview-stale';

export async function loadDimDistribution(
  prisma: PrismaService,
  dim: 'area' | 'category',
  limit: number
): Promise<OverviewDistributionRow[]> {
  const col = dim === 'area' ? 'areaName' : 'category';
  const raw = (await prisma.$queryRawUnsafe(
    `SELECT "${col}" AS "key", COUNT(*) AS "totalSku", COALESCE(SUM("stockLeft"), 0) AS "stockLeft" FROM "ContentPackage" WHERE "${col}" IS NOT NULL AND "${col}" <> '' GROUP BY "${col}" ORDER BY "totalSku" DESC LIMIT ?`,
    limit
  )) as Array<{ key: string; totalSku: number; stockLeft: number }>;
  return raw.map((r) => ({
    key: r.key,
    totalSku: Number(r.totalSku),
    stockLeft: Number(r.stockLeft)
  }));
}

export async function loadOverviewDistribution(
  prisma: PrismaService,
  dim: 'area' | 'category' | 'stale',
  limit: number
): Promise<OverviewDistributionRow[]> {
  if (dim === 'area' || dim === 'category') return loadDimDistribution(prisma, dim, limit);
  const stats = await aggregateStaleBucketStats(prisma);
  return (['stale_60d', 'stale_30d', 'stale_15d', 'stale_7d', 'normal'] as const)
    .map((bucket) => ({ key: bucket, totalSku: stats[bucket] ?? 0, stockLeft: 0 }))
    .filter((r) => r.totalSku > 0)
    .slice(0, limit);
}
