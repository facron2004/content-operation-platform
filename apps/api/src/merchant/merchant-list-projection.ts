/** Merchant list sorting, pagination, cache orchestration, and scope windows. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { DEFAULT_INVENTORY_RULES } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import type { MerchantsListQueryDto } from './merchant.dto';
import { MERCHANT_LIST_CACHE_CAP, clampListPage, clampListPageSize } from '../common/sql-chunk';
import { buildMerchantListItems } from './merchant-list-metrics';
import { listMerchantRows, listMerchantRowsByMetric } from './merchant-list-queries';
import type { MerchantListItem } from './merchant-list-types';

export function sortMerchantItems(
  items: MerchantListItem[],
  sort: 'totalSkuDesc' | 'totalGmvDesc' | 'staleDesc' | 'stale30Desc' | string | undefined
): void {
  if (sort === 'totalSkuDesc') {
    items.sort((a, b) => b.totalSku - a.totalSku || a.merchantId.localeCompare(b.merchantId));
  } else if (sort === 'totalGmvDesc') {
    items.sort((a, b) => b.totalGmv30d - a.totalGmv30d || a.merchantId.localeCompare(b.merchantId));
  } else {
    // Default / stale30Desc / staleDesc
    items.sort(
      (a, b) => b.stale30SkuCount - a.stale30SkuCount || a.merchantId.localeCompare(b.merchantId)
    );
  }
}

export function paginateMerchantItems(items: MerchantListItem[], query: MerchantsListQueryDto) {
  // Defense-in-depth: DTO Max may be bypassed if pipe is misconfigured.
  const page = clampListPage(query.page, 100);
  const pageSize = clampListPageSize(query.pageSize);
  const offset = (page - 1) * pageSize;
  // Residual #266: total is head-window size (≤ MERCHANT_LIST_CACHE_CAP), not
  // full catalog cardinality. Surface limit/truncated so SPA can warn.
  const limit = MERCHANT_LIST_CACHE_CAP;
  return {
    items: items.slice(offset, offset + pageSize),
    pagination: {
      page,
      pageSize,
      hasMore: items.length > offset + pageSize,
      total: items.length
    },
    limit,
    truncated: items.length >= limit
  };
}

/**
 * Full merchant aggregate (sorted). Page is applied by the caller so a TTL
 * cache can share one scan across every page flip for the same filters/scope.
 *
 * totalSkuDesc: prune-by-totalSku then enrich metrics.
 * totalGmvDesc / stale30Desc: metric-first SQL head (ORDER BY metric LIMIT CAP).
 */
export async function computeMerchantsWithStale(params: {
  prisma: PrismaService;
  query: Pick<MerchantsListQueryDto, 'areaId' | 'search' | 'sort'>;
  scope?: { merchantIds?: string[]; areaIds?: string[] };
  /** Override for tests / cache key alignment. Defaults to Beijing today. */
  today?: string;
}): Promise<MerchantListItem[]> {
  const today = params.today ?? beijingDateKey(new Date());
  const rules = DEFAULT_INVENTORY_RULES;
  const staleThreshold = shiftDateKey(today, -(rules.stale30Days - 1));
  const sort: string = params.query.sort ?? 'stale30Desc';
  const scopeQ = {
    areaId: params.query.areaId,
    search: params.query.search,
    areaIds: params.scope?.areaIds,
    merchantIds: params.scope?.merchantIds
  };

  // Metric-first head — avoid merchantId-ordered CAP dropping top GMV/stale merchants.
  if (sort === 'totalGmvDesc' || sort === 'stale30Desc' || sort === 'staleDesc') {
    const items = await listMerchantRowsByMetric(params.prisma, {
      ...scopeQ,
      sort,
      staleThreshold,
      limit: MERCHANT_LIST_CACHE_CAP
    });
    // Already ordered by SQL; re-sort for stable ties.
    sortMerchantItems(items, sort);
    return items.length <= MERCHANT_LIST_CACHE_CAP
      ? items
      : items.slice(0, MERCHANT_LIST_CACHE_CAP);
  }

  const merchants = await listMerchantRows(params.prisma, {
    ...scopeQ,
    sort
  });
  const items = await buildMerchantListItems({
    prisma: params.prisma,
    merchants,
    staleThreshold
  });
  sortMerchantItems(items, sort);
  // Bound TTL-cached aggregate (parity with MOVEMENT_CACHE_CAP).
  return items.length <= MERCHANT_LIST_CACHE_CAP ? items : items.slice(0, MERCHANT_LIST_CACHE_CAP);
}

export async function listMerchantsWithStale(params: {
  prisma: PrismaService;
  query: MerchantsListQueryDto;
  scope?: { merchantIds?: string[]; areaIds?: string[] };
}) {
  const items = await computeMerchantsWithStale(params);
  return paginateMerchantItems(items, params.query);
}

/** Stable cache key for the full aggregate (page/pageSize intentionally excluded). */
export function merchantListCacheKey(params: {
  query: Pick<MerchantsListQueryDto, 'areaId' | 'search' | 'sort'>;
  scope?: { merchantIds?: string[]; areaIds?: string[] };
  today: string;
}): string {
  const areaIds = [...(params.scope?.areaIds ?? [])].sort();
  const merchantIds = [...(params.scope?.merchantIds ?? [])].sort();
  return [
    'merchants:list',
    params.today,
    params.query.sort ?? 'stale30Desc',
    params.query.areaId ?? '',
    params.query.search ?? '',
    areaIds.join(','),
    merchantIds.join(',')
  ].join('|');
}
