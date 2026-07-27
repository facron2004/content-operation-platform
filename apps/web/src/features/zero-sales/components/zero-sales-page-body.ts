import { computed, unref } from 'vue';
import type { useZeroSalesPage } from '../composables/useZeroSalesPage';
type Page = ReturnType<typeof useZeroSalesPage>;
export function useZeroSalesPageBody(p: Page) {
  const overviewKpi = computed(() => unref(p.overviewKpi));
  const dim = computed({
    get: () => unref(p.dim),
    set: (v) => {
      p.dim.value = v;
    }
  });
  const staleOption = computed(() => unref(p.staleOption)),
    dimOption = computed(() => unref(p.dimOption));
  const staleBucket = computed(() => unref(p.staleBucket));
  const activeTab = computed({
    get: () => unref(p.activeTab),
    set: (v) => {
      p.activeTab.value = v;
    }
  });
  const filters = computed(() => unref(p.filters));
  const merchantRows = computed(() => unref(p.merchantRows)),
    merchantLoading = computed(() => unref(p.merchantLoading));
  const merchantPage = computed(() => unref(p.merchantPage)),
    merchantHasMore = computed(() => unref(p.merchantHasMore));
  // Residual #266: ZERO_SALES_MERCHANTS_CACHE_CAP honesty.
  const merchantTruncated = computed(() => Boolean(unref(p.merchantTruncated)));
  const merchantLimit = computed(() => {
    const v = unref(p.merchantLimit);
    return typeof v === 'number' && v > 0 ? v : null;
  });
  const skuRows = computed(() => unref(p.skuRows)),
    skuLoading = computed(() => unref(p.skuLoading));
  const skuPage = computed(() => unref(p.skuPage)),
    skuHasMore = computed(() => unref(p.skuHasMore));
  // Residual #266: ZERO_SALES_SKUS_CACHE_CAP honesty.
  const skuTruncated = computed(() => Boolean(unref(p.skuTruncated)));
  const skuLimit = computed(() => {
    const v = unref(p.skuLimit);
    return typeof v === 'number' && v > 0 ? v : null;
  });
  return {
    overviewKpi,
    dim,
    staleOption,
    dimOption,
    staleBucket,
    activeTab,
    filters,
    merchantRows,
    merchantLoading,
    merchantPage,
    merchantHasMore,
    merchantTruncated,
    merchantLimit,
    skuRows,
    skuLoading,
    skuPage,
    skuHasMore,
    skuTruncated,
    skuLimit
  };
}
