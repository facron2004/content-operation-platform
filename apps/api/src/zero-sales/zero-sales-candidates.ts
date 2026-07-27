/** Consolidated zero-sales module. */
import type { InventoryRuleConfig } from '../domain/rules-defaults';
import { likeContains, sanitizeContainsSearch } from '../common/like-escape';
import {
  PLATFORM_SCAN_LIMIT,
  ZERO_SALES_MERCHANTS_CACHE_CAP,
  queryInChunks
} from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import type { CandidateRow, MerchantAcc, StaleBucket } from './zero-sales.dto';

// --- zero-sales-bucket.ts ---
export function staleDaysFromBucket(bucket: StaleBucket, rules: InventoryRuleConfig): number {
  switch (bucket) {
    case 'stale_60d':
      return rules.stale60Days;
    case 'stale_30d':
      return rules.stale30Days;
    case 'stale_15d':
      return rules.stale15Days;
    case 'stale_7d':
      return rules.stale7Days;
    case 'normal':
      return 0;
  }
}
export function bucketFromDays(days: number, rules: InventoryRuleConfig): StaleBucket {
  if (days >= rules.stale60Days) return 'stale_60d';
  if (days >= rules.stale30Days) return 'stale_30d';
  if (days >= rules.stale15Days) return 'stale_15d';
  if (days >= rules.stale7Days) return 'stale_7d';
  return 'normal';
}

/**
 * Build filter SQL for filter-first stale candidates.
 * Push NOT EXISTS into SQL so we never materialize 10k in-stock packages then
 * filter in JS (previous cold path). Cap at min(PLATFORM_SCAN, CACHE_CAP).
 */
function buildStaleCandidateFilters(q: {
  merchantId?: string;
  merchantIds?: string[];
  areaId?: string;
  areaIds?: string[];
  search?: string;
}): { filters: string[]; params: string[] } {
  const filters: string[] = ['cp."stockLeft" > 0'];
  const params: string[] = [];
  if (q.merchantIds?.length) {
    const merchantIds = q.merchantIds.slice(0, 200);
    filters.push(`cp."merchantId" IN (${merchantIds.map(() => '?').join(',')})`);
    params.push(...merchantIds);
  } else if (q.merchantId) {
    filters.push('cp."merchantId" = ?');
    params.push(q.merchantId);
  }
  if (q.areaIds?.length) {
    const areaIds = q.areaIds.slice(0, 200);
    filters.push(`cp."areaId" IN (${areaIds.map(() => '?').join(',')})`);
    params.push(...areaIds);
  } else if (q.areaId) {
    filters.push('cp."areaId" = ?');
    params.push(q.areaId);
  }
  const search = sanitizeContainsSearch(q.search);
  if (search) {
    filters.push(`cp."merchantName" LIKE ? ESCAPE '\\'`);
    params.push(likeContains(search));
  }
  return { filters, params };
}

// --- zero-sales-candidates-load.ts ---
/**
 * Filter-first stale candidates.
 * Previous path: findMany take 10k → multi-chunk DISTINCT recent sales → JS filter.
 * Now: single SQL with NOT EXISTS + LIMIT (CACHE_CAP) so peak memory never holds 10k.
 * merchantIds > DEFAULT_IN_CHUNK still chunked via queryInChunks then re-cap.
 */
export async function loadStaleCandidates(
  prisma: PrismaService,
  q: {
    merchantId?: string;
    merchantIds?: string[];
    areaId?: string;
    areaIds?: string[];
    search?: string;
  },
  staleThreshold: string
): Promise<CandidateRow[]> {
  const limit = Math.min(PLATFORM_SCAN_LIMIT, ZERO_SALES_MERCHANTS_CACHE_CAP);
  const selectSql = (filtersSql: string) => `
    SELECT
      cp."packageId" AS "packageId",
      cp."merchantId" AS "merchantId",
      cp."merchantName" AS "merchantName",
      cp."areaName" AS "areaName",
      cp."areaId" AS "areaId"
    FROM "ContentPackage" cp
    WHERE ${filtersSql}
      AND NOT EXISTS (
        SELECT 1 FROM "PackageSalesDaily" s
        WHERE s."packageId" = cp."packageId"
          AND s."date" >= ?
          AND s."salesQty" > 0
      )
    ORDER BY cp."packageId" ASC
    LIMIT ?
  `;

  // Multi-merchant scope may exceed DEFAULT_IN_CHUNK — chunk + re-cap.
  if (q.merchantIds && q.merchantIds.length > 500) {
    const base = { ...q, merchantIds: undefined as string[] | undefined };
    const rows = await queryInChunks(q.merchantIds.slice(0, 200), async (chunk) => {
      const { filters, params } = buildStaleCandidateFilters({
        ...base,
        merchantIds: chunk
      });
      return (await prisma.$queryRawUnsafe(
        selectSql(filters.join(' AND ')),
        ...params,
        staleThreshold,
        String(limit)
      )) as CandidateRow[];
    });
    return rows.length > limit ? rows.slice(0, limit) : rows;
  }

  const { filters, params } = buildStaleCandidateFilters(q);
  return (await prisma.$queryRawUnsafe(
    selectSql(filters.join(' AND ')),
    ...params,
    staleThreshold,
    String(limit)
  )) as CandidateRow[];
}

// --- zero-sales-candidates-group.ts ---
export function groupCandidatesByMerchant(candidates: CandidateRow[]): Map<string, MerchantAcc> {
  const byMerchant = new Map<string, MerchantAcc>();
  for (const r of candidates) {
    const m = byMerchant.get(r.merchantId);
    if (m) m.packageIds.push(r.packageId);
    else
      byMerchant.set(r.merchantId, {
        merchantId: r.merchantId,
        merchantName: r.merchantName,
        areaName: r.areaName ?? '',
        areaId: r.areaId ?? '',
        packageIds: [r.packageId]
      });
  }
  return byMerchant;
}
