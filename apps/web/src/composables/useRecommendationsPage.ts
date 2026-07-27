import {
  computed,
  onMounted,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type Reactive,
  type Ref
} from 'vue';
import type { Router } from 'vue-router';
import { useRouter } from 'vue-router';
import type { PaginationMeta, RecommendPackageItem, UserRole } from '@content/shared';
import { api } from '../services/api';
import { clearPackageCache } from '../services/cache.service';
import { useRoleStore } from '../stores/role';

export function buildRecommendAreaOptions(packages: RecommendPackageItem[]) {
  const areaMap = new Map<string, string>();
  for (const pkg of packages) {
    if (pkg.areaId && pkg.areaName && !areaMap.has(pkg.areaId))
      areaMap.set(pkg.areaId, pkg.areaName);
  }
  return [...areaMap.entries()].map(([value, label]) => ({ value, label }));
}

export async function loadRecommendCategoryOptions(options: {
  areaId: string;
  role: UserRole;
  requestId: number;
  currentRequestId: () => number;
  categoryOptions: Ref<string[]>;
}) {
  try {
    const data = await api.getCategories({
      areaId: options.areaId || undefined,
      role: options.role
    });
    if (options.requestId !== options.currentRequestId()) return;
    options.categoryOptions.value = data.categories;
  } catch {
    /* interceptor already surfaces errors */
  }
}

export async function loadRecommendationsPage(o: {
  force: boolean;
  role: UserRole;
  // Residual #220/#222/#225: merchantId + inventory bounds + as-of date.
  filters: {
    areaId: string;
    merchantId: string;
    category: string;
    unsoldOnly: boolean;
    inventoryMin: string;
    inventoryMax: string;
    date: string;
  };
  pagination: Omit<PaginationMeta, 'totalPages'>;
  requestId: number;
  currentRequestId: () => number;
  loading: Ref<boolean>;
  items: Ref<RecommendPackageItem[]>;
  areaOptions: Ref<Array<{ value: string; label: string }>>;
  /** Soft page cache shared across page flips within one filter set. */
  pageCache?: Map<
    string,
    {
      items: RecommendPackageItem[];
      total: number;
      // Residual #267: RECOMMEND_CACHE_CAP honesty (stashed with page cache).
      truncated?: boolean;
      limit?: number | null;
      matchedCount?: number | null;
    }
  >;
  pageCacheSize?: number;
  // Residual #267: RECOMMEND_CACHE_CAP honesty sinks.
  listTruncated?: Ref<boolean>;
  listLimit?: Ref<number | null>;
  matchedCount?: Ref<number | null>;
}) {
  const cacheSize = o.pageCacheSize ?? 8;
  const invMin = o.filters.inventoryMin.trim();
  const invMax = o.filters.inventoryMax.trim();
  const asOfDate = o.filters.date.trim();
  const cacheKey = [
    o.pagination.page,
    o.pagination.pageSize,
    o.role,
    o.filters.areaId,
    o.filters.merchantId,
    o.filters.category,
    o.filters.unsoldOnly ? '1' : '0',
    invMin,
    invMax,
    asOfDate
  ].join('|');
  if (!o.force && o.pageCache && cacheSize > 0) {
    const hit = o.pageCache.get(cacheKey);
    if (hit) {
      o.pageCache.delete(cacheKey);
      o.pageCache.set(cacheKey, hit);
      o.items.value = hit.items;
      o.pagination.total = hit.total;
      if (o.listTruncated) o.listTruncated.value = Boolean(hit.truncated);
      if (o.listLimit)
        o.listLimit.value = typeof hit.limit === 'number' && hit.limit > 0 ? hit.limit : null;
      if (o.matchedCount)
        o.matchedCount.value =
          typeof hit.matchedCount === 'number' && hit.matchedCount >= 0 ? hit.matchedCount : null;
      o.loading.value = false;
      return;
    }
  }
  // Keep previous rows while fetching so page flips don't blank the table.
  o.loading.value = true;
  try {
    if (o.force) {
      clearPackageCache();
      o.pagination.page = 1;
      o.pageCache?.clear();
    }
    const inventoryMinNum =
      invMin !== '' && Number.isFinite(Number(invMin)) ? Number(invMin) : undefined;
    const inventoryMaxNum =
      invMax !== '' && Number.isFinite(Number(invMax)) ? Number(invMax) : undefined;
    const data = await api.getRecommendations({
      role: o.role,
      areaId: o.filters.areaId || undefined,
      // Residual #220: forward merchantId (DTO + client already accept it).
      merchantId: o.filters.merchantId || undefined,
      status: 'selling',
      category: o.filters.category || undefined,
      inventoryFlag: o.filters.unsoldOnly ? 'unsold' : undefined,
      // Residual #222: inventory bounds (API RecommendationsQueryDto already applied).
      inventoryMin: inventoryMinNum,
      inventoryMax: inventoryMaxNum,
      // Residual #225: as-of business day.
      date: asOfDate || undefined,
      page: o.pagination.page,
      pageSize: o.pagination.pageSize
    });
    if (o.requestId !== o.currentRequestId()) return;
    o.items.value = data.packages;
    o.pagination.total = data.pagination?.total ?? o.items.value.length;
    // Residual #267: RECOMMEND_CACHE_CAP honesty.
    const nextTruncated = Boolean(data.truncated);
    const nextLimit = typeof data.limit === 'number' && data.limit > 0 ? data.limit : null;
    const nextMatched =
      typeof data.matchedCount === 'number' && data.matchedCount >= 0 ? data.matchedCount : null;
    if (o.listTruncated) o.listTruncated.value = nextTruncated;
    if (o.listLimit) o.listLimit.value = nextLimit;
    if (o.matchedCount) o.matchedCount.value = nextMatched;
    o.areaOptions.value = buildRecommendAreaOptions(data.packages);
    if (o.pageCache && cacheSize > 0) {
      if (o.pageCache.has(cacheKey)) o.pageCache.delete(cacheKey);
      o.pageCache.set(cacheKey, {
        items: data.packages,
        total: o.pagination.total,
        truncated: nextTruncated,
        limit: nextLimit,
        matchedCount: nextMatched
      });
      while (o.pageCache.size > cacheSize) {
        const oldest = o.pageCache.keys().next().value;
        if (oldest === undefined) break;
        o.pageCache.delete(oldest);
      }
    }
  } catch {
    /* interceptor */
  } finally {
    if (o.requestId === o.currentRequestId()) o.loading.value = false;
  }
}
export function createRecommendationsLoaders(params: {
  roleStore: { currentRole: UserRole };
  filters: Reactive<{
    areaId: string;
    merchantId: string;
    category: string;
    unsoldOnly: boolean;
    inventoryMin: string;
    inventoryMax: string;
    date: string;
  }>;
  pagination: Reactive<Omit<PaginationMeta, 'totalPages'>>;
  loading: Ref<boolean>;
  items: Ref<RecommendPackageItem[]>;
  areaOptions: Ref<Array<{ value: string; label: string }>>;
  categoryOptions: Ref<string[]>;
  pageCache?: Map<
    string,
    {
      items: RecommendPackageItem[];
      total: number;
      truncated?: boolean;
      limit?: number | null;
      matchedCount?: number | null;
    }
  >;
  // Residual #267: RECOMMEND_CACHE_CAP honesty sinks.
  listTruncated?: Ref<boolean>;
  listLimit?: Ref<number | null>;
  matchedCount?: Ref<number | null>;
}) {
  let loadRequestId = 0,
    categoryOptionsRequestId = 0;
  const load = async (force = false) => {
    const requestId = ++loadRequestId;
    await loadRecommendationsPage({
      force,
      role: params.roleStore.currentRole,
      filters: params.filters,
      pagination: params.pagination,
      requestId,
      currentRequestId: () => loadRequestId,
      loading: params.loading,
      items: params.items,
      areaOptions: params.areaOptions,
      pageCache: params.pageCache,
      listTruncated: params.listTruncated,
      listLimit: params.listLimit,
      matchedCount: params.matchedCount
    });
  };
  const loadCategoryOptions = async () => {
    const requestId = ++categoryOptionsRequestId;
    await loadRecommendCategoryOptions({
      areaId: params.filters.areaId,
      role: params.roleStore.currentRole,
      requestId,
      currentRequestId: () => categoryOptionsRequestId,
      categoryOptions: params.categoryOptions
    });
  };
  return { load, loadCategoryOptions };
}

export function createRecommendationsPageActions(params: {
  filters: Reactive<{
    areaId: string;
    merchantId: string;
    category: string;
    unsoldOnly: boolean;
    inventoryMin: string;
    inventoryMax: string;
    date: string;
  }>;
  pagination: Reactive<Omit<PaginationMeta, 'totalPages'>>;
  hasFilters: ComputedRef<boolean>;
  load: (force?: boolean) => Promise<void>;
  loadCategoryOptions: () => Promise<void>;
  router: Router;
}) {
  const loadPage = (page?: number, pageSize?: number) => {
    if (typeof page === 'number') params.pagination.page = page;
    if (typeof pageSize === 'number') params.pagination.pageSize = pageSize;
    return params.load();
  };
  const clearFilters = () => {
    const shouldReload = params.hasFilters.value;
    params.filters.areaId = '';
    params.filters.merchantId = '';
    params.filters.category = '';
    params.filters.unsoldOnly = false;
    params.filters.inventoryMin = '';
    params.filters.inventoryMax = '';
    params.filters.date = '';
    if (!shouldReload) {
      params.load(true);
      params.loadCategoryOptions();
    }
  };
  return {
    loadPage,
    clearFilters,
    openAnalysis: (row: RecommendPackageItem) => params.router.push(`/packages/${row.packageId}`),
    goGenerate: (packageId: string) =>
      params.router.push({ path: '/generate', query: { packageId } })
  };
}

const swallowHandled = <T>(promise: Promise<T>): void => {
  promise.catch(() => undefined);
};
export function bindRecommendationsWatches(options: {
  roleStore: ReturnType<typeof useRoleStore>;
  filters: {
    areaId: string;
    merchantId: string;
    category: string;
    unsoldOnly: boolean;
    inventoryMin: string;
    inventoryMax: string;
    date: string;
  };
  load: (force?: boolean) => Promise<void>;
  loadCategoryOptions: () => Promise<void>;
}) {
  const reloadAll = () =>
    swallowHandled(Promise.all([options.load(true), options.loadCategoryOptions()]));
  const reload = () => swallowHandled(options.load(true));
  watch(() => options.roleStore.currentRole, reloadAll);
  watch(() => options.filters.areaId, reloadAll);
  // Residual #220: merchantId change reloads list (does not affect category options).
  watch(() => options.filters.merchantId, reload);
  watch(() => options.filters.category, reload);
  watch(() => options.filters.unsoldOnly, reload);
  // Residual #222: inventory bounds.
  watch(() => options.filters.inventoryMin, reload);
  watch(() => options.filters.inventoryMax, reload);
  // Residual #225: as-of business day.
  watch(() => options.filters.date, reload);
}

export function useRecommendationsPage() {
  const router = useRouter(),
    roleStore = useRoleStore(),
    loading = ref(false),
    items = ref<RecommendPackageItem[]>([]);
  const categoryOptions = ref<string[]>([]),
    areaOptions = ref<Array<{ value: string; label: string }>>([]);
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
    items,
    areaOptions,
    categoryOptions,
    pageCache,
    listTruncated,
    listLimit,
    matchedCount
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
  onMounted(async () => {
    await Promise.all([load(), loadCategoryOptions()]);
  });
  return {
    loading,
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
    ...actions
  };
}
