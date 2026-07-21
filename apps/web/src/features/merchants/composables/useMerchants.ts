import { useRoute, useRouter } from 'vue-router';
import { createMerchantState, loadMerchantDetail, loadMerchantList } from './merchant-core';
import { bindMerchantRoute, buildMerchantActions } from './merchant-ui';

export function useMerchants() {
  const route = useRoute();
  const router = useRouter();
  const state = createMerchantState((route.query.merchantId as string) ?? undefined);
  const {
    loading,
    detailLoading,
    loadError,
    merchants,
    search,
    page,
    hasMore,
    selectedMerchantId,
    selectedMerchant,
    profile,
    trend,
    skuList,
    competitors
  } = state;

  async function reloadList() {
    await loadMerchantList({ search, page, merchants, hasMore, loading, loadError });
  }
  async function reloadDetail() {
    await loadMerchantDetail({
      merchantId: selectedMerchantId.value,
      detailLoading,
      profile,
      trend,
      skuList,
      competitors,
      loadError
    });
  }
  function selectMerchant(id: string) {
    selectedMerchantId.value = id;
    router.replace({ query: { merchantId: id } });
    selectedMerchant.value = merchants.value.find((x) => x.merchantId === id) ?? null;
    reloadDetail();
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
    page,
    hasMore,
    selectedMerchantId,
    selectedMerchant,
    profile,
    trend,
    skuList,
    competitors,
    ...buildMerchantActions({ router, state, reloadList, reloadDetail, selectMerchant })
  };
}
