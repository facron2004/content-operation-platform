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
  const skuRows = computed(() => unref(p.skuRows)),
    skuLoading = computed(() => unref(p.skuLoading));
  const skuPage = computed(() => unref(p.skuPage)),
    skuHasMore = computed(() => unref(p.skuHasMore));
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
    skuRows,
    skuLoading,
    skuPage,
    skuHasMore
  };
}
