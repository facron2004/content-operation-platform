import type { Ref } from 'vue';
import type { LocationQuery, Router } from 'vue-router';
import {
  STALE_BUCKETS,
  STALE_BUCKET_COLORS,
  STALE_BUCKET_LABELS,
  getZeroSalesExportUrl,
  type StaleBucket,
  type ZeroSalesMerchantRow,
  type ZeroSalesSkuRow
} from '../../../services/api/zero-sales.api';
import { downloadBlob } from '../../../services/http-client';
import {
  applyZeroSalesRouteQuery,
  bindZeroSalesRouteWatch,
  buildZeroSalesQuery,
  createZeroSalesLoaders,
  createZeroSalesState,
  merchantRowClass,
  skuRowClass,
  zeroSalesFilterParams,
  type ZeroSalesState,
  type ZeroSalesTab
} from './zero-sales-core';

export { STALE_BUCKETS, STALE_BUCKET_COLORS, STALE_BUCKET_LABELS };
export type { StaleBucket, ZeroSalesMerchantRow, ZeroSalesSkuRow, ZeroSalesTab };

// --- navigation / export ---
export function goPackageAnalysis(router: Router, packageId: string) {
  router.push({ name: 'package-analysis', params: { packageId }, query: { from: 'zero-sales' } });
}
export function goPackageGenerate(router: Router, packageId: string) {
  router.push({ name: 'generate', query: { packageId, from: 'zero-sales' } });
}
export function exportZeroSalesCsv(params: {
  staleBucket?: StaleBucket;
  merchantId?: string;
  category?: string;
  areaId?: string;
  search?: string;
}) {
  const url = getZeroSalesExportUrl({
    staleBucket: params.staleBucket,
    merchantId: params.merchantId,
    category: params.category,
    areaId: params.areaId,
    search: params.search
  });
  downloadBlob(url, `零动销SKU-${params.staleBucket ?? '全部'}.csv`);
}

// --- pagination ---
export function stepZeroSalesPage(params: {
  tab: ZeroSalesTab;
  direction: 'prev' | 'next';
  merchantPage: Ref<number>;
  skuPage: Ref<number>;
  merchantHasMore: Ref<boolean>;
  skuHasMore: Ref<boolean>;
  loadMerchants: () => void | Promise<void>;
  loadSkus: () => void | Promise<void>;
}): void {
  const {
    tab,
    direction,
    merchantPage,
    skuPage,
    merchantHasMore,
    skuHasMore,
    loadMerchants,
    loadSkus
  } = params;
  if (tab === 'merchant') {
    if (direction === 'prev' && merchantPage.value > 1) {
      merchantPage.value -= 1;
      void loadMerchants();
    } else if (direction === 'next' && merchantHasMore.value) {
      merchantPage.value += 1;
      void loadMerchants();
    }
    return;
  }
  if (direction === 'prev' && skuPage.value > 1) {
    skuPage.value -= 1;
    void loadSkus();
  } else if (direction === 'next' && skuHasMore.value) {
    skuPage.value += 1;
    void loadSkus();
  }
}

// --- action builders ---
export function buildZeroSalesNavActions(params: {
  activeTab: Ref<ZeroSalesTab>;
  filters: Ref<{ merchantId?: string }>;
  skuPage: Ref<number>;
  syncQuery: () => void;
  loadSkus: () => Promise<void>;
  router: Router;
  exportCsv: () => void;
}) {
  return {
    goMerchantDetail(merchantId: string) {
      params.activeTab.value = 'sku';
      params.filters.value.merchantId = merchantId;
      params.skuPage.value = 1;
      params.syncQuery();
      params.loadSkus();
    },
    exportCsv: params.exportCsv
  };
}
export function buildZeroSalesPageActions(params: {
  activeTab: Ref<ZeroSalesTab>;
  merchantPage: Ref<number>;
  skuPage: Ref<number>;
  merchantHasMore: Ref<boolean>;
  skuHasMore: Ref<boolean>;
  loadMerchants: () => Promise<void>;
  loadSkus: () => Promise<void>;
  reload: () => Promise<void>;
  syncQuery: () => void;
}) {
  const pageCtx = {
    merchantPage: params.merchantPage,
    skuPage: params.skuPage,
    merchantHasMore: params.merchantHasMore,
    skuHasMore: params.skuHasMore,
    loadMerchants: params.loadMerchants,
    loadSkus: params.loadSkus
  };
  return {
    onFilterChange() {
      params.merchantPage.value = 1;
      params.skuPage.value = 1;
      params.syncQuery();
      params.reload();
    },
    onTabChange(tab: string | number) {
      params.activeTab.value = tab as ZeroSalesTab;
      params.syncQuery();
      params.reload();
    },
    prevPage: (tab: ZeroSalesTab) => stepZeroSalesPage({ tab, direction: 'prev', ...pageCtx }),
    nextPage: (tab: ZeroSalesTab) => stepZeroSalesPage({ tab, direction: 'next', ...pageCtx })
  };
}
export function buildZeroSalesQuerySync(params: { state: ZeroSalesState; router: Router }) {
  return () => {
    params.router.replace({
      query: buildZeroSalesQuery({
        tab: params.state.activeTab.value,
        stale: params.state.staleBucket.value,
        ...zeroSalesFilterParams(params.state)
      })
    });
  };
}
export function buildZeroSalesActions(params: {
  state: ZeroSalesState;
  router: Router;
  loadMerchants: () => Promise<void>;
  loadSkus: () => Promise<void>;
  reload: () => Promise<void>;
  syncQuery: () => void;
}) {
  const { activeTab, filters, merchantPage, skuPage, merchantHasMore, skuHasMore } = params.state;
  const { loadMerchants, loadSkus, reload, syncQuery, router } = params;
  return {
    ...buildZeroSalesPageActions({
      activeTab,
      merchantPage,
      skuPage,
      merchantHasMore,
      skuHasMore,
      loadMerchants,
      loadSkus,
      reload,
      syncQuery
    }),
    ...buildZeroSalesNavActions({
      activeTab,
      filters,
      skuPage,
      syncQuery,
      loadSkus,
      router,
      exportCsv: () => exportZeroSalesCsv(zeroSalesFilterParams(params.state))
    }),
    goAnalysis: (id: string) => goPackageAnalysis(router, id),
    goGenerate: (id: string) => goPackageGenerate(router, id)
  };
}

// --- controller ---
type ZeroSalesActions = ReturnType<typeof buildZeroSalesActions>;

export function exposeZeroSalesController(
  state: ZeroSalesState,
  reload: () => Promise<void>,
  actions: ZeroSalesActions
) {
  return {
    activeTab: state.activeTab,
    staleBucket: state.staleBucket,
    filters: state.filters,
    loading: state.loading,
    loadError: state.loadError,
    merchantRows: state.merchantRows,
    merchantLoading: state.merchantLoading,
    merchantPage: state.merchantPage,
    merchantHasMore: state.merchantHasMore,
    skuRows: state.skuRows,
    skuLoading: state.skuLoading,
    skuPage: state.skuPage,
    skuHasMore: state.skuHasMore,
    reload,
    merchantRowClass,
    skuRowClass,
    ...actions
  };
}

export function createZeroSalesController(params: {
  routeQuery: LocationQuery;
  router: Router;
  onMounted: (cb: () => void) => void;
  watchQuery: (cb: (q: LocationQuery) => void) => void;
}) {
  const state = createZeroSalesState(params.routeQuery);
  const { loadMerchants, loadSkus, reload } = createZeroSalesLoaders(state);
  const syncQuery = buildZeroSalesQuerySync({ state, router: params.router });
  const actions = buildZeroSalesActions({
    state,
    router: params.router,
    loadMerchants,
    loadSkus,
    reload,
    syncQuery
  });
  bindZeroSalesRouteWatch({
    reload,
    onMounted: params.onMounted,
    watchQuery: params.watchQuery,
    applyQuery: (q) =>
      applyZeroSalesRouteQuery(q, {
        staleBucket: state.staleBucket,
        filters: state.filters,
        activeTab: state.activeTab,
        merchantPage: state.merchantPage,
        skuPage: state.skuPage
      })
  });
  return exposeZeroSalesController(state, reload, actions);
}
