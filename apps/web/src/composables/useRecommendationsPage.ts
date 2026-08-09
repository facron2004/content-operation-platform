import { computed, onMounted, onScopeDispose, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { PaginationMeta, RecommendPackageItem } from '@content/shared';
import { useRoleStore } from '../stores/role';
import {
  bindRecommendationsWatches,
  createRecommendationsPageActions
} from './recommendations-page-actions';
import { createRecommendationsLoaders } from './recommendations-page-loaders';

export {
  buildRecommendAreaOptions,
  createRecommendationsLoaders,
  loadRecommendCategoryOptions,
  loadRecommendationsPage
} from './recommendations-page-loaders';

export {
  bindRecommendationsWatches,
  createRecommendationsPageActions
} from './recommendations-page-actions';

export function useRecommendationsPage() {
  const router = useRouter(),
    roleStore = useRoleStore(),
    loading = ref(false),
    loadError = ref<string | null>(null),
    items = ref<RecommendPackageItem[]>([]);
  const categoryOptions = ref<string[]>([]),
    areaOptions = ref<Array<{ value: string; label: string }>>([]),
    categoryError = ref<string | null>(null);
  // Residual #267: RECOMMEND_CACHE_CAP honesty.
  const listTruncated = ref(false);
  const listLimit = ref<number | null>(null);
  const matchedCount = ref<number | null>(null);
  // Residual #220: seed merchantId from deep-link (e.g. merchants → recommend).
  const seedMerchantId =
    typeof router.currentRoute.value.query.merchantId === 'string'
      ? router.currentRoute.value.query.merchantId
      : '';
  // Residual #225: optional as-of deep-link (?date=YYYY-MM-DD).
  const seedDate =
    typeof router.currentRoute.value.query.date === 'string'
      ? router.currentRoute.value.query.date
      : '';
  const filters = reactive<{
    areaId: string;
    merchantId: string;
    category: string;
    unsoldOnly: boolean;
    inventoryMin: string;
    inventoryMax: string;
    date: string;
  }>({
    areaId: '',
    merchantId: seedMerchantId,
    category: '',
    unsoldOnly: false,
    inventoryMin: '',
    inventoryMax: '',
    date: seedDate
  });
  const pagination = reactive<Omit<PaginationMeta, 'totalPages'>>({
    page: 1,
    pageSize: 50,
    total: 0
  });
  let disposed = false;
  const isDisposed = () => disposed;
  /** Soft page LRU so flipping back is instant without re-hitting the API. */
  const pageCache = new Map<
    string,
    {
      items: RecommendPackageItem[];
      total: number;
      truncated?: boolean;
      limit?: number | null;
      matchedCount?: number | null;
    }
  >();
  const hasFilters = computed(
    () =>
      !!filters.areaId ||
      !!filters.merchantId ||
      !!filters.category ||
      filters.unsoldOnly ||
      !!filters.inventoryMin ||
      !!filters.inventoryMax ||
      !!filters.date
  );
  const { load, loadCategoryOptions } = createRecommendationsLoaders({
    roleStore,
    filters,
    pagination,
    loading,
    loadError,
    items,
    areaOptions,
    categoryOptions,
    categoryError,
    pageCache,
    listTruncated,
    listLimit,
    matchedCount,
    isDisposed
  });
  const actions = createRecommendationsPageActions({
    filters,
    pagination,
    hasFilters,
    load,
    loadCategoryOptions,
    router
  });
  bindRecommendationsWatches({ roleStore, filters, load, loadCategoryOptions });
  onMounted(() => {
    void Promise.all([load(), loadCategoryOptions()]).catch(() => undefined);
  });
  onScopeDispose(() => {
    disposed = true;
    loading.value = false;
  }, true);
  return {
    loading,
    loadError,
    categoryError,
    items,
    categoryOptions,
    areaOptions,
    filters,
    pagination,
    // Residual #267: RECOMMEND_CACHE_CAP honesty.
    listTruncated,
    listLimit,
    matchedCount,
    load,
    loadCategoryOptions,
    ...actions
  };
}
