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
  filters: { areaId: string; category: string; unsoldOnly: boolean };
  pagination: Omit<PaginationMeta, 'totalPages'>;
  requestId: number;
  currentRequestId: () => number;
  loading: Ref<boolean>;
  items: Ref<RecommendPackageItem[]>;
  areaOptions: Ref<Array<{ value: string; label: string }>>;
}) {
  o.loading.value = true;
  try {
    if (o.force) {
      clearPackageCache();
      o.pagination.page = 1;
    }
    const data = await api.getRecommendations({
      role: o.role,
      areaId: o.filters.areaId || undefined,
      status: 'selling',
      category: o.filters.category || undefined,
      inventoryFlag: o.filters.unsoldOnly ? 'unsold' : undefined,
      page: o.pagination.page,
      pageSize: o.pagination.pageSize
    });
    if (o.requestId !== o.currentRequestId()) return;
    o.items.value = data.packages;
    o.pagination.total = data.pagination?.total ?? o.items.value.length;
    o.areaOptions.value = buildRecommendAreaOptions(data.packages);
  } catch {
    /* interceptor */
  } finally {
    if (o.requestId === o.currentRequestId()) o.loading.value = false;
  }
}
export function createRecommendationsLoaders(params: {
  roleStore: { currentRole: UserRole };
  filters: Reactive<{ areaId: string; category: string; unsoldOnly: boolean }>;
  pagination: Reactive<Omit<PaginationMeta, 'totalPages'>>;
  loading: Ref<boolean>;
  items: Ref<RecommendPackageItem[]>;
  areaOptions: Ref<Array<{ value: string; label: string }>>;
  categoryOptions: Ref<string[]>;
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
      areaOptions: params.areaOptions
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
  filters: Reactive<{ areaId: string; category: string; unsoldOnly: boolean }>;
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
    params.filters.category = '';
    params.filters.unsoldOnly = false;
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
  filters: { areaId: string; category: string; unsoldOnly: boolean };
  load: (force?: boolean) => Promise<void>;
  loadCategoryOptions: () => Promise<void>;
}) {
  const reloadAll = () =>
    swallowHandled(Promise.all([options.load(true), options.loadCategoryOptions()]));
  const reload = () => swallowHandled(options.load(true));
  watch(() => options.roleStore.currentRole, reloadAll);
  watch(() => options.filters.areaId, reloadAll);
  watch(() => options.filters.category, reload);
  watch(() => options.filters.unsoldOnly, reload);
}

export function useRecommendationsPage() {
  const router = useRouter(),
    roleStore = useRoleStore(),
    loading = ref(false),
    items = ref<RecommendPackageItem[]>([]);
  const categoryOptions = ref<string[]>([]),
    areaOptions = ref<Array<{ value: string; label: string }>>([]);
  const filters = reactive<{ areaId: string; category: string; unsoldOnly: boolean }>({
    areaId: '',
    category: '',
    unsoldOnly: false
  });
  const pagination = reactive<Omit<PaginationMeta, 'totalPages'>>({
    page: 1,
    pageSize: 50,
    total: 0
  });
  const hasFilters = computed(() => !!filters.areaId || !!filters.category || filters.unsoldOnly);
  const { load, loadCategoryOptions } = createRecommendationsLoaders({
    roleStore,
    filters,
    pagination,
    loading,
    items,
    areaOptions,
    categoryOptions
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
  return { loading, items, categoryOptions, areaOptions, filters, pagination, load, ...actions };
}
