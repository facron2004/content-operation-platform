import { ref, type Ref } from 'vue';
import type { LocationQuery } from 'vue-router';
import {
  getMerchantCompetitors,
  getMerchantProfile,
  getMerchantSkus,
  getMerchantTrend,
  listMerchants,
  type MerchantCompetitor,
  type MerchantListItem,
  type MerchantProfile,
  type MerchantSkuItem,
  type MerchantTrendResponse
} from '../../../services/api/merchant.api';
import { extractErrorMessage } from '../../../services/http-client';

// Residual #219: MerchantsListQueryDto.sort already applied; SPA unwired.
export type MerchantListSort = 'stale30Desc' | 'totalSkuDesc' | 'totalGmvDesc';
export const MERCHANT_LIST_SORT_OPTIONS: Array<{ label: string; value: MerchantListSort }> = [
  { label: '30天滞销SKU(降序)', value: 'stale30Desc' },
  { label: 'SKU 总数(降序)', value: 'totalSkuDesc' },
  { label: '30天 GMV(降序)', value: 'totalGmvDesc' }
];

/** Residual #235: MerchantTrendQueryDto days Min(7) Max(90). */
export const MERCHANT_DETAIL_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export type MerchantDetailDayOption = (typeof MERCHANT_DETAIL_DAY_OPTIONS)[number];

export function clampMerchantDetailDays(raw: number | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 30;
  if (n < 7) return 7;
  if (n > 90) return 90;
  return n;
}

function initMerchantListFilters(query: LocationQuery) {
  const sortRaw = String(query.sort ?? '');
  const sort =
    sortRaw === 'totalSkuDesc' || sortRaw === 'totalGmvDesc' || sortRaw === 'stale30Desc'
      ? (sortRaw as MerchantListSort)
      : 'stale30Desc';
  return {
    areaId: (query.areaId as string) || '',
    sort
  };
}

export function createMerchantState(query: LocationQuery = {}) {
  const filters = initMerchantListFilters(query);
  return {
    loading: ref(false),
    detailLoading: ref(false),
    listError: ref<string | null>(null),
    detailError: ref<string | null>(null),
    merchants: ref<MerchantListItem[]>([]),
    search: ref((query.search as string) || ''),
    // Residual #219: areaId + sort (API MerchantsListQueryDto already applied).
    areaId: ref(filters.areaId),
    sort: ref<MerchantListSort>(filters.sort),
    page: ref(1),
    hasMore: ref(false),
    // Residual #266: MERCHANT_LIST_CACHE_CAP honesty.
    listTruncated: ref(false),
    listLimit: ref<number | null>(null),
    selectedMerchantId: ref<string | undefined>((query.merchantId as string) || undefined),
    selectedMerchant: ref<MerchantListItem | null>(null),
    profile: ref<MerchantProfile | null>(null),
    trend: ref<MerchantTrendResponse | null>(null),
    skuList: ref<MerchantSkuItem[]>([]),
    competitors: ref<MerchantCompetitor[]>([]),
    // Residual #235: operator-selectable detail window (API 7–90).
    detailDays: ref(30),
    // Residual #250: listSkus LIMIT honesty (server MERCHANT_SKU_LIST_LIMIT).
    skuTruncated: ref(false),
    skuLimit: ref<number | null>(null),
    // Residual #285: MERCHANT_COMPETITORS_LIMIT Top-N honesty.
    competitorsTruncated: ref(false),
    competitorsLimit: ref<number | null>(null),
    competitorsMatched: ref<number | null>(null)
  };
}

export async function loadMerchantList(params: {
  search: Ref<string>;
  areaId: Ref<string>;
  sort: Ref<MerchantListSort>;
  page: Ref<number>;
  merchants: Ref<MerchantListItem[]>;
  hasMore: Ref<boolean>;
  loading: Ref<boolean>;
  listError: Ref<string | null>;
  // Residual #266: optional honesty sinks for MERCHANT_LIST_CACHE_CAP.
  listTruncated?: Ref<boolean>;
  listLimit?: Ref<number | null>;
  force?: boolean;
  isCurrent?: () => boolean;
}): Promise<void> {
  const isCurrent = params.isCurrent ?? (() => true);
  params.loading.value = true;
  if (isCurrent()) params.listError.value = null;
  try {
    const result = await listMerchants({
      search: params.search.value || undefined,
      // Residual #219: forward areaId + sort (default stale30Desc server-side).
      areaId: params.areaId.value || undefined,
      sort: params.sort.value,
      page: params.page.value,
      pageSize: 20,
      ...(params.force ? { force: true } : {})
    });
    if (!isCurrent()) return;
    params.merchants.value = result.items;
    params.hasMore.value = result.pagination.hasMore;
    if (params.listTruncated) params.listTruncated.value = Boolean(result.truncated);
    if (params.listLimit)
      params.listLimit.value =
        typeof result.limit === 'number' && result.limit > 0 ? result.limit : null;
  } catch (err) {
    if (isCurrent()) params.listError.value = extractErrorMessage(err, '加载商家列表失败');
  } finally {
    if (isCurrent()) params.loading.value = false;
  }
}

export async function loadMerchantDetail(params: {
  merchantId: string | undefined;
  detailLoading: Ref<boolean>;
  profile: Ref<MerchantProfile | null>;
  trend: Ref<MerchantTrendResponse | null>;
  skuList: Ref<MerchantSkuItem[]>;
  competitors: Ref<MerchantCompetitor[]>;
  detailError: Ref<string | null>;
  // Residual #235: forward MerchantTrendQueryDto days (default 30).
  days?: Ref<number> | number;
  // Residual #250: optional honesty sinks for listSkus LIMIT.
  skuTruncated?: Ref<boolean>;
  skuLimit?: Ref<number | null>;
  // Residual #285: optional honesty sinks for competitors LIMIT.
  competitorsTruncated?: Ref<boolean>;
  competitorsLimit?: Ref<number | null>;
  competitorsMatched?: Ref<number | null>;
  force?: boolean;
  isCurrent?: () => boolean;
}): Promise<void> {
  if (!params.merchantId) return;
  const isCurrent = params.isCurrent ?? (() => true);
  params.detailLoading.value = true;
  if (isCurrent()) params.detailError.value = null;
  const dayCount = clampMerchantDetailDays(
    typeof params.days === 'number' ? params.days : params.days?.value
  );
  try {
    const [p, t, skus, comp] = await Promise.all([
      getMerchantProfile(params.merchantId, params.force === true),
      getMerchantTrend(params.merchantId, dayCount),
      getMerchantSkus(params.merchantId, dayCount, params.force === true),
      getMerchantCompetitors(params.merchantId)
    ]);
    if (!isCurrent()) return;
    params.profile.value = p;
    params.trend.value = t;
    params.skuList.value = skus.items;
    params.competitors.value = comp.competitors;
    // Residual #250: surface server LIMIT honesty (default false when absent).
    if (params.skuTruncated) params.skuTruncated.value = Boolean(skus.truncated);
    if (params.skuLimit) {
      params.skuLimit.value =
        typeof skus.limit === 'number' && Number.isFinite(skus.limit) ? skus.limit : null;
    }
    // Residual #285: MERCHANT_COMPETITORS_LIMIT Top-N honesty.
    if (params.competitorsTruncated) {
      params.competitorsTruncated.value = Boolean(comp.truncated);
    }
    if (params.competitorsLimit) {
      params.competitorsLimit.value =
        typeof comp.limit === 'number' && Number.isFinite(comp.limit) ? comp.limit : null;
    }
    if (params.competitorsMatched) {
      params.competitorsMatched.value =
        typeof comp.matched === 'number' && Number.isFinite(comp.matched) ? comp.matched : null;
    }
  } catch (err) {
    if (isCurrent()) params.detailError.value = extractErrorMessage(err, '加载商家详情失败');
  } finally {
    if (isCurrent()) params.detailLoading.value = false;
  }
}
