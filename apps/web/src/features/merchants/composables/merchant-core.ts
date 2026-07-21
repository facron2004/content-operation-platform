import { ref, type Ref } from 'vue';
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

export function createMerchantState(routeMerchantId?: string) {
  return {
    loading: ref(false),
    detailLoading: ref(false),
    loadError: ref<string | null>(null),
    merchants: ref<MerchantListItem[]>([]),
    search: ref(''),
    page: ref(1),
    hasMore: ref(false),
    selectedMerchantId: ref<string | undefined>(routeMerchantId),
    selectedMerchant: ref<MerchantListItem | null>(null),
    profile: ref<MerchantProfile | null>(null),
    trend: ref<MerchantTrendResponse | null>(null),
    skuList: ref<MerchantSkuItem[]>([]),
    competitors: ref<MerchantCompetitor[]>([])
  };
}

export async function loadMerchantList(params: {
  search: Ref<string>;
  page: Ref<number>;
  merchants: Ref<MerchantListItem[]>;
  hasMore: Ref<boolean>;
  loading: Ref<boolean>;
  loadError: Ref<string | null>;
}): Promise<void> {
  params.loading.value = true;
  try {
    const result = await listMerchants({
      search: params.search.value || undefined,
      page: params.page.value,
      pageSize: 20
    });
    params.merchants.value = result.items;
    params.hasMore.value = result.pagination.hasMore;
  } catch (err) {
    params.loadError.value = extractErrorMessage(err, '加载商家列表失败');
  } finally {
    params.loading.value = false;
  }
}

export async function loadMerchantDetail(params: {
  merchantId: string | undefined;
  detailLoading: Ref<boolean>;
  profile: Ref<MerchantProfile | null>;
  trend: Ref<MerchantTrendResponse | null>;
  skuList: Ref<MerchantSkuItem[]>;
  competitors: Ref<MerchantCompetitor[]>;
  loadError: Ref<string | null>;
}): Promise<void> {
  if (!params.merchantId) return;
  params.detailLoading.value = true;
  try {
    const [p, t, skus, comp] = await Promise.all([
      getMerchantProfile(params.merchantId),
      getMerchantTrend(params.merchantId, 30),
      getMerchantSkus(params.merchantId, 30),
      getMerchantCompetitors(params.merchantId)
    ]);
    params.profile.value = p;
    params.trend.value = t;
    params.skuList.value = skus.items;
    params.competitors.value = comp.competitors;
  } catch (err) {
    params.loadError.value = extractErrorMessage(err, '加载商家详情失败');
  } finally {
    params.detailLoading.value = false;
  }
}
