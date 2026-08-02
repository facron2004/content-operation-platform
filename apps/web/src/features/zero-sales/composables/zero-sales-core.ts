import { ref, type Ref } from 'vue';
import type { LocationQuery } from 'vue-router';
import {
  getZeroSalesMerchants,
  getZeroSalesSkus,
  type StaleBucket,
  type ZeroSalesMerchantRow,
  type ZeroSalesSkuRow
} from '../../../services/api/zero-sales.api';
import { extractErrorMessage } from '../../../services/http-client';
import { isRequestCanceled } from '../../../services/http-client-utils';

// --- state / query helpers ---
export type ZeroSalesTab = 'merchant' | 'sku';
export type ZeroSalesSort = 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
export interface ZeroSalesFilters {
  areaId?: string;
  category?: string;
  search?: string;
  merchantId?: string;
  // Residual #217: API ZeroSalesSkusQueryDto.sort already applied; SPA unwired.
  sort?: ZeroSalesSort;
}
export function initZeroSalesTab(query: LocationQuery): ZeroSalesTab {
  return (query.tab as ZeroSalesTab) ?? 'merchant';
}
export function initZeroSalesBucket(query: LocationQuery): StaleBucket {
  return (query.stale as StaleBucket) ?? 'stale_30d';
}
export function initZeroSalesFilters(query: LocationQuery): ZeroSalesFilters {
  const sortRaw = String(query.sort ?? '');
  const sort =
    sortRaw === 'staleDesc' || sortRaw === 'gmvDesc' || sortRaw === 'lastSalesDateAsc'
      ? (sortRaw as ZeroSalesSort)
      : undefined;
  return {
    areaId: (query.areaId as string) ?? undefined,
    category: (query.category as string) ?? undefined,
    search: (query.search as string) ?? undefined,
    merchantId: (query.merchantId as string) ?? undefined,
    sort
  };
}
export function applyZeroSalesRouteQuery(
  query: LocationQuery,
  state: {
    staleBucket: { value: StaleBucket };
    filters: { value: ZeroSalesFilters };
    activeTab: { value: ZeroSalesTab };
    merchantPage: { value: number };
    skuPage: { value: number };
  }
): void {
  if (query.stale && query.stale !== state.staleBucket.value)
    state.staleBucket.value = query.stale as StaleBucket;
  if (query.merchantId !== state.filters.value.merchantId) {
    state.filters.value.merchantId = query.merchantId as string | undefined;
    state.merchantPage.value = 1;
    state.skuPage.value = 1;
  }
  if (query.tab && query.tab !== state.activeTab.value)
    state.activeTab.value = query.tab as ZeroSalesTab;
}
export function zeroSalesFilterParams(state: {
  staleBucket: Ref<StaleBucket>;
  filters: Ref<ReturnType<typeof initZeroSalesFilters>>;
}) {
  return {
    staleBucket: state.staleBucket.value,
    merchantId: state.filters.value.merchantId,
    category: state.filters.value.category,
    areaId: state.filters.value.areaId,
    search: state.filters.value.search,
    // Residual #217: SKU sort (ignored by merchants endpoint).
    sort: state.filters.value.sort
  };
}
export function merchantRowClass({ row }: { row: ZeroSalesMerchantRow }) {
  if (row.staleSkuCount >= 10) return 'is-danger';
  if (row.staleSkuCount >= 5) return 'is-warning';
  return '';
}
export function skuRowClass({ row }: { row: ZeroSalesSkuRow }) {
  if (row.staleBucket === 'stale_60d') return 'is-danger';
  if (row.staleBucket === 'stale_30d') return 'is-warning';
  return '';
}
export function buildZeroSalesQuery(params: {
  tab: 'merchant' | 'sku';
  stale: StaleBucket;
  merchantId?: string;
  areaId?: string;
  category?: string;
  search?: string;
  sort?: ZeroSalesSort;
}) {
  return {
    tab: params.tab,
    stale: params.stale,
    merchantId: params.merchantId,
    areaId: params.areaId,
    category: params.category,
    search: params.search,
    sort: params.sort
  };
}
export function createZeroSalesState(query: LocationQuery) {
  return {
    activeTab: ref<ZeroSalesTab>(initZeroSalesTab(query)),
    staleBucket: ref<StaleBucket>(initZeroSalesBucket(query)),
    filters: ref(initZeroSalesFilters(query)),
    loading: ref(false),
    loadError: ref<string | null>(null),
    merchantRows: ref<ZeroSalesMerchantRow[]>([]),
    merchantLoading: ref(false),
    merchantPage: ref(1),
    merchantHasMore: ref(false),
    // Residual #266: ZERO_SALES_MERCHANTS_CACHE_CAP honesty.
    merchantTruncated: ref(false),
    merchantLimit: ref<number | null>(null),
    skuRows: ref<ZeroSalesSkuRow[]>([]),
    skuLoading: ref(false),
    skuPage: ref(1),
    skuHasMore: ref(false),
    // Residual #266: ZERO_SALES_SKUS_CACHE_CAP honesty.
    skuTruncated: ref(false),
    skuLimit: ref<number | null>(null)
  };
}
export type ZeroSalesState = ReturnType<typeof createZeroSalesState>;

// --- loaders ---
export async function loadZeroSalesSkus(params: {
  staleBucket: StaleBucket;
  merchantId?: string;
  category?: string;
  areaId?: string;
  search?: string;
  sort?: ZeroSalesSort;
  page: number;
  skuRows: Ref<ZeroSalesSkuRow[]>;
  skuHasMore: Ref<boolean>;
  skuLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  // Residual #266: optional honesty sinks for ZERO_SALES_SKUS_CACHE_CAP.
  skuTruncated?: Ref<boolean>;
  skuLimit?: Ref<number | null>;
}) {
  params.skuLoading.value = true;
  try {
    const result = await getZeroSalesSkus({
      staleBucket: params.staleBucket,
      merchantId: params.merchantId,
      category: params.category,
      areaId: params.areaId,
      search: params.search,
      // Residual #217: forward sort (default lastSalesDateAsc server-side when omitted).
      sort: params.sort,
      page: params.page,
      pageSize: 50
    });
    params.skuRows.value = result.items;
    params.skuHasMore.value = result.pagination.hasMore;
    if (params.skuTruncated) params.skuTruncated.value = Boolean(result.truncated);
    if (params.skuLimit)
      params.skuLimit.value =
        typeof result.limit === 'number' && result.limit > 0 ? result.limit : null;
  } catch (err) {
    if (!isRequestCanceled(err))
      params.loadError.value = extractErrorMessage(err, '加载商品清单失败');
  } finally {
    params.skuLoading.value = false;
  }
}
export async function loadZeroSalesMerchants(params: {
  staleBucket: StaleBucket;
  merchantId?: string;
  areaId?: string;
  search?: string;
  page: number;
  merchantRows: Ref<ZeroSalesMerchantRow[]>;
  merchantHasMore: Ref<boolean>;
  merchantLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  // Residual #266: optional honesty sinks for ZERO_SALES_MERCHANTS_CACHE_CAP.
  merchantTruncated?: Ref<boolean>;
  merchantLimit?: Ref<number | null>;
}) {
  params.merchantLoading.value = true;
  try {
    const result = await getZeroSalesMerchants({
      staleBucket: params.staleBucket,
      merchantId: params.merchantId,
      areaId: params.areaId,
      search: params.search,
      page: params.page,
      pageSize: 20
    });
    params.merchantRows.value = result.items;
    params.merchantHasMore.value = result.pagination.hasMore;
    if (params.merchantTruncated) params.merchantTruncated.value = Boolean(result.truncated);
    if (params.merchantLimit)
      params.merchantLimit.value =
        typeof result.limit === 'number' && result.limit > 0 ? result.limit : null;
  } catch (err) {
    if (!isRequestCanceled(err))
      params.loadError.value = extractErrorMessage(err, '加载商家清单失败');
  } finally {
    params.merchantLoading.value = false;
  }
}
export function createZeroSalesLoaders(state: ZeroSalesState) {
  const loadMerchants = () =>
    loadZeroSalesMerchants({
      ...zeroSalesFilterParams(state),
      page: state.merchantPage.value,
      merchantRows: state.merchantRows,
      merchantHasMore: state.merchantHasMore,
      merchantLoading: state.merchantLoading,
      loadError: state.loadError,
      merchantTruncated: state.merchantTruncated,
      merchantLimit: state.merchantLimit
    });
  const loadSkus = () =>
    loadZeroSalesSkus({
      ...zeroSalesFilterParams(state),
      page: state.skuPage.value,
      skuRows: state.skuRows,
      skuHasMore: state.skuHasMore,
      skuLoading: state.skuLoading,
      loadError: state.loadError,
      skuTruncated: state.skuTruncated,
      skuLimit: state.skuLimit
    });
  const reload = async () => {
    state.loading.value = true;
    state.loadError.value = null;
    await Promise.all([state.activeTab.value === 'merchant' ? loadMerchants() : loadSkus()]);
    state.loading.value = false;
  };
  return { loadMerchants, loadSkus, reload };
}
export function bindZeroSalesRouteWatch(params: {
  reload: () => Promise<void>;
  onMounted: (cb: () => void) => void;
  watchQuery: (cb: (q: LocationQuery) => void) => void;
  applyQuery: (q: LocationQuery) => void;
}) {
  params.watchQuery((q) => {
    params.applyQuery(q);
    params.reload();
  });
  params.onMounted(params.reload);
}
