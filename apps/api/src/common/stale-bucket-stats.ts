/**
 * Shared platform stale-bucket histogram (in-stock packages by days-since-last-sale).
 * movement-today + overview distribution used to each re-run the same full-catalog
 * LEFT JOIN GroupBy — cold dashboard paints paid 2×. One TTL + getOrLoad loader.
 */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES, type InventoryRuleConfig } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import { withHeavyAggregateGate } from './heavy-aggregate-gate';
import { TtlCache } from './ttl-cache';

export type StaleBucketKey = 'normal' | 'stale_7d' | 'stale_15d' | 'stale_30d' | 'stale_60d';

export const STALE_BUCKET_KEYS: StaleBucketKey[] = [
  'stale_60d',
  'stale_30d',
  'stale_15d',
  'stale_7d',
  'normal'
];

export type StaleBucketStats = Record<StaleBucketKey, number>;

/** Short TTL — same day key; operators flip tabs between movement + overview. */
const STALE_BUCKET_TTL_MS = 60_000;
const staleBucketCache = new TtlCache(STALE_BUCKET_TTL_MS, 8);

export function emptyStaleBucketStats(): StaleBucketStats {
  return {
    normal: 0,
    stale_7d: 0,
    stale_15d: 0,
    stale_30d: 0,
    stale_60d: 0
  };
}

/**
 * Full-catalog in-stock histogram by stale bucket. Single-flight per today key.
 * Thresholds default to DEFAULT_INVENTORY_RULES (matches movement STALE_THRESHOLDS).
 */
export function loadPlatformStaleBucketStats(
  prisma: PrismaService,
  today = beijingDateKey(new Date()),
  rules: InventoryRuleConfig = DEFAULT_INVENTORY_RULES
): Promise<StaleBucketStats> {
  const cacheKey = `staleBuckets:${today}:${rules.stale7Days}:${rules.stale15Days}:${rules.stale30Days}:${rules.stale60Days}`;
  // Cache hits skip the gate; full-catalog LEFT JOIN cold path shares the process pool.
  return staleBucketCache.getOrLoad(cacheKey, false, () =>
    withHeavyAggregateGate(() => computePlatformStaleBucketStats(prisma, today, rules))
  );
}

export async function computePlatformStaleBucketStats(
  prisma: PrismaService,
  today: string,
  rules: InventoryRuleConfig = DEFAULT_INVENTORY_RULES
): Promise<StaleBucketStats> {
  // Bound PSD join to the stale60 lookback — older sales cannot change bucket
  // classification (null last_sale already maps to stale_60d). Full-history join
  // grew with PackageSalesDaily and pinned SQLite on every cold miss.
  const salesFrom = shiftDateKey(today, -(Math.max(1, rules.stale60Days) - 1));
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT bucket, COUNT(*) AS "totalSku" FROM (
       SELECT CASE
         WHEN last_sale IS NULL OR (julianday(?) - julianday(last_sale)) >= ? THEN 'stale_60d'
         WHEN (julianday(?) - julianday(last_sale)) >= ? THEN 'stale_30d'
         WHEN (julianday(?) - julianday(last_sale)) >= ? THEN 'stale_15d'
         WHEN (julianday(?) - julianday(last_sale)) >= ? THEN 'stale_7d'
         ELSE 'normal'
       END AS bucket
       FROM (
         SELECT cp."packageId", MAX(s."date") AS last_sale
         FROM "ContentPackage" cp
         LEFT JOIN "PackageSalesDaily" s
           ON s."packageId" = cp."packageId"
          AND s."salesQty" > 0
          AND s."date" >= ?
         WHERE cp."stockLeft" > 0
         GROUP BY cp."packageId"
       )
     ) GROUP BY bucket`,
    today,
    rules.stale60Days,
    today,
    rules.stale30Days,
    today,
    rules.stale15Days,
    today,
    rules.stale7Days,
    salesFrom
  )) as Array<{ bucket: string; totalSku: number }>;

  const stats = emptyStaleBucketStats();
  for (const r of rows) {
    if (r.bucket in stats) {
      stats[r.bucket as StaleBucketKey] = Number(r.totalSku);
    }
  }
  return stats;
}

/** Packages with no sale in ≥30d (stale_30d + stale_60d buckets). */
export function stale30SkuCountFromBuckets(stats: StaleBucketStats): number {
  return (stats.stale_30d ?? 0) + (stats.stale_60d ?? 0);
}
