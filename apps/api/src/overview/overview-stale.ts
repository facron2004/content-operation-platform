import type { InventoryRuleConfig } from '../domain/rules-defaults';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import type { PrismaService } from '../prisma/prisma.service';
import {
  computePlatformStaleBucketStats,
  loadPlatformStaleBucketStats,
  stale30SkuCountFromBuckets
} from '../common/stale-bucket-stats';
import type { OverviewTopOffender } from './overview.types';

/**
 * Stale-30 KPI inputs. SKU count comes from the shared platform histogram
 * (same TTL as movement-today / overview distribution) so a cold home paint
 * does not pay a third full-catalog scan for the same threshold.
 * Merchant DISTINCT still needs a separate NOT EXISTS (histogram has no merchant dim).
 */
export async function aggregateStaleSkuStats(
  prisma: PrismaService,
  today: string,
  rules: InventoryRuleConfig,
  force = false
) {
  const threshold = shiftDateKey(today, -(rules.stale30Days - 1));
  // Sequential: histogram is process-TTL cached (often hit); merchant DISTINCT is
  // the cold full-catalog NOT EXISTS. Running both in parallel doubles SQLite
  // load on cold miss under the same heavy-gate holder.
  const buckets = force
    ? await computePlatformStaleBucketStats(prisma, today, rules)
    : await loadPlatformStaleBucketStats(prisma, today, rules);
  const merchantRow = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "merchantId") AS "distinctMerchants"
     FROM "ContentPackage"
     WHERE "stockLeft" > 0
       AND "merchantId" IS NOT NULL AND "merchantId" <> ''
       AND NOT EXISTS (
         SELECT 1 FROM "PackageSalesDaily" s
         WHERE s."packageId" = "ContentPackage"."packageId"
           AND s."salesQty" > 0 AND s."date" >= ? AND s."date" <= ?
       )`,
    threshold,
    today
  )) as Array<{ distinctMerchants: number }>;
  const [row] = merchantRow;
  return {
    stale30SkuCount: stale30SkuCountFromBuckets(buckets),
    distinctMerchants: Number(row?.distinctMerchants ?? 0)
  };
}

/**
 * Bucket every in-stock package by days-since-last-sale.
 * Shared process TTL with movement-today (see loadPlatformStaleBucketStats).
 */
export async function aggregateStaleBucketStats(
  prisma: PrismaService,
  date?: string,
  force = false
): Promise<Record<string, number>> {
  const today = date ?? beijingDateKey(new Date());
  return force
    ? computePlatformStaleBucketStats(prisma, today)
    : loadPlatformStaleBucketStats(prisma, today);
}

export type StaleMerchantOffenderRow = {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  stale30SkuCount: number;
  totalSku: number | null;
};

export async function queryStaleMerchantOffenders(
  prisma: PrismaService,
  threshold: string,
  asOfDate: string,
  limit: number
): Promise<StaleMerchantOffenderRow[]> {
  // Pre-aggregate totalSku once (merchant_total CTE) — previous correlated
  // (SELECT COUNT(*) FROM ContentPackage cp2 WHERE …) re-scanned the table per group.
  // stockLeft > 0 keeps totalSku aligned with in-stock inventory (outer stale set).
  return (await prisma.$queryRawUnsafe(
    `WITH merchant_total AS (
       SELECT "merchantId", COUNT(*) AS "totalSku"
       FROM "ContentPackage"
       WHERE "merchantId" IS NOT NULL AND "merchantId" <> ''
         AND "stockLeft" > 0
       GROUP BY "merchantId"
     )
     SELECT
       cp."merchantId",
       MIN(cp."merchantName") AS "merchantName",
       MIN(cp."areaName") AS "areaName",
       COUNT(DISTINCT cp."packageId") AS "stale30SkuCount",
       COALESCE(mt."totalSku", 0) AS "totalSku"
     FROM "ContentPackage" cp
     LEFT JOIN merchant_total mt ON mt."merchantId" = cp."merchantId"
     WHERE cp."stockLeft" > 0
       AND NOT EXISTS (
         SELECT 1 FROM "PackageSalesDaily" s
         WHERE s."packageId" = cp."packageId"
           AND s."salesQty" > 0 AND s."date" >= ? AND s."date" <= ?
       )
     GROUP BY cp."merchantId", mt."totalSku"
     ORDER BY "stale30SkuCount" DESC
     LIMIT ?`,
    threshold,
    asOfDate,
    limit
  )) as StaleMerchantOffenderRow[];
}

export type OverviewTopOffendersPayload = {
  items: OverviewTopOffender[];
  /** Residual #287: requested Top-N head (OverviewTopOffendersQueryDto.limit). */
  limit: number;
  /**
   * Residual #287: rows matched before head clip.
   * When truncated, this is `limit + 1` (LIMIT+1 probe — at-least, not exact COUNT).
   */
  matched: number;
  truncated: boolean;
};

export async function loadTopOffenders(
  prisma: PrismaService,
  limit: number,
  date?: string
): Promise<OverviewTopOffendersPayload> {
  const safeLimit = Math.max(1, Math.floor(limit) || 10);
  const today = date ?? beijingDateKey(new Date());
  const threshold = shiftDateKey(today, -(DEFAULT_INVENTORY_RULES.stale30Days - 1));
  // Residual #287: LIMIT+1 probe — exact truncated without COUNT(*), head stays Top-N.
  const rows = await queryStaleMerchantOffenders(prisma, threshold, today, safeLimit + 1);
  const truncated = rows.length > safeLimit;
  const head = rows.slice(0, safeLimit);
  const items = head.map((r) => ({
    merchantId: r.merchantId,
    merchantName: r.merchantName,
    areaName: r.areaName,
    stale30SkuCount: Number(r.stale30SkuCount),
    totalSku: Number(r.totalSku ?? 0)
  }));
  return {
    items,
    limit: safeLimit,
    matched: truncated ? safeLimit + 1 : items.length,
    truncated
  };
}
