import { useRoute, useRouter } from 'vue-router';
import {
  clampMerchantDetailDays,
  createMerchantState,
  loadMerchantDetail,
  loadMerchantList,
  MERCHANT_DETAIL_DAY_OPTIONS,
  MERCHANT_LIST_SORT_OPTIONS
} from './merchant-core';
import { bindMerchantRoute, buildMerchantActions } from './merchant-ui';

export function useMerchants() {
  const route = useRoute();
  const router = useRouter();
  // Residual #219: seed areaId/sort/search from route query.
  const state = createMerchantState(route.query);
  const {
    loading,
    detailLoading,
    loadError,
    merchants,
    search,
    areaId,
    sort,
    page,
    hasMore,
    // Residual #266: MERCHANT_LIST_CACHE_CAP honesty.
    listTruncated,
    listLimit,
    selectedMerchantId,
    selectedMerchant,
    profile,
    trend,
    skuList,
    competitors,
    detailDays,
    // Residual #250: listSkus LIMIT honesty.
    skuTruncated,
    skuLimit,
    // Residual #285: MERCHANT_COMPETITORS_LIMIT Top-N honesty.
    competitorsTruncated,
    competitorsLimit,
    competitorsMatched
  } = state;

  async function reloadList() {
    await loadMerchantList({
      search,
      areaId,
      sort,
      page,
      merchants,
      hasMore,
      loading,
      loadError,
      listTruncated,
      listLimit
    });
  }
  async function reloadDetail() {
    await loadMerchantDetail({
      merchantId: selectedMerchantId.value,
      detailLoading,
      profile,
      trend,
      skuList,
      competitors,
      loadError,
      // Residual #235: pass operator-selected window.
      days: detailDays,
      // Residual #250: listSkus LIMIT honesty sinks.
      skuTruncated,
      skuLimit,
      // Residual #285: competitors Top-N honesty sinks.
      competitorsTruncated,
      competitorsLimit,
      competitorsMatched
    });
  }
  function selectMerchant(id: string) {
    selectedMerchantId.value = id;
    router.replace({
      query: {
        merchantId: id,
        // Residual #219: keep list filters in URL when selecting a merchant.
        search: search.value || undefined,
        areaId: areaId.value || undefined,
        sort: sort.value !== 'stale30Desc' ? sort.value : undefined
      }
    });
    selectedMerchant.value = merchants.value.find((x) => x.merchantId === id) ?? null;
    reloadDetail();
  }
  // Residual #219: filter change resets page so area/sort/search never empty-page.
  async function onFilterChange() {
    page.value = 1;
    await reloadList();
  }
  /** Residual #235: re-fetch trend + skus for the selected window (7–90). */
  async function setDetailDays(next: number) {
    const clamped = clampMerchantDetailDays(next);
    if (clamped === detailDays.value) return;
    detailDays.value = clamped;
    if (!selectedMerchantId.value) return;
    await reloadDetail();
  }
  bindMerchantRoute({
    route,
    selectedMerchantId,
    selectedMerchant,
    merchants,
    reloadList,
    reloadDetail
  });
  return {
    loading,
    detailLoading,
    loadError,
    merchants,
    search,
    areaId,
    sort,
    page,
    hasMore,
    // Residual #266: MERCHANT_LIST_CACHE_CAP honesty.
    listTruncated,
    listLimit,
    selectedMerchantId,
    selectedMerchant,
    profile,
    trend,
    skuList,
    competitors,
    detailDays,
    // Residual #250: listSkus LIMIT honesty for MerchantSkuTable.
    skuTruncated,
    skuLimit,
    // Residual #285: MERCHANT_COMPETITORS_LIMIT honesty for MerchantCompetitorsTable.
    competitorsTruncated,
    competitorsLimit,
    competitorsMatched,
    detailDayOptions: MERCHANT_DETAIL_DAY_OPTIONS,
    setDetailDays,
    sortOptions: MERCHANT_LIST_SORT_OPTIONS,
    onFilterChange,
    ...buildMerchantActions({ router, state, reloadList, reloadDetail, selectMerchant })
  };
}
