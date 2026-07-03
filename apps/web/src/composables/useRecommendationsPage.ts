import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { PaginationMeta, RecommendPackageItem } from '@content/shared';
import { api } from '../services/api';
import { clearPackageCache } from '../services/cache.service';
import { useRoleStore } from '../stores/role';

export function useRecommendationsPage() {
  const router = useRouter();
  const roleStore = useRoleStore();
  const loading = ref(false);
  const items = ref<RecommendPackageItem[]>([]);
  const categoryOptions = ref<string[]>([]);
  const areaOptions = ref<Array<{ value: string; label: string }>>([]);
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
  let loadRequestId = 0;
  let categoryOptionsRequestId = 0;

  const hasFilters = computed(() => !!filters.areaId || !!filters.category || filters.unsoldOnly);

  const buildAreaOptions = (packages: RecommendPackageItem[]) => {
    const areaMap = new Map<string, string>();
    for (const pkg of packages) {
      if (pkg.areaId && pkg.areaName && !areaMap.has(pkg.areaId))
        areaMap.set(pkg.areaId, pkg.areaName);
    }
    areaOptions.value = [...areaMap.entries()].map(([value, label]) => ({ value, label }));
  };

  const load = async (force = false) => {
    const requestId = ++loadRequestId;
    loading.value = true;
    try {
      if (force) {
        clearPackageCache();
        pagination.page = 1;
      }
      const data = await api.getRecommendations({
        role: roleStore.currentRole,
        areaId: filters.areaId || undefined,
        status: 'selling',
        category: filters.category || undefined,
        inventoryFlag: filters.unsoldOnly ? 'unsold' : undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      });
      if (requestId !== loadRequestId) return;
      items.value = data.packages;
      pagination.total = data.pagination?.total ?? items.value.length;
      buildAreaOptions(data.packages);
    } catch {
      // 错误已由拦截器处理
    } finally {
      if (requestId === loadRequestId) loading.value = false;
    }
  };

  /**
   * 分页器回调:同步 page / pageSize 后重新加载,而不是无脑 `() => load()`。
   * el-pagination 的 current-change 传页码,size-change 传每页条数,二选一。
   */
  const loadPage = (page?: number, pageSize?: number) => {
    if (typeof page === 'number') pagination.page = page;
    if (typeof pageSize === 'number') pagination.pageSize = pageSize;
    return load();
  };

  const loadCategoryOptions = async () => {
    const requestId = ++categoryOptionsRequestId;
    try {
      const data = await api.getCategories({
        areaId: filters.areaId || undefined,
        role: roleStore.currentRole
      });
      if (requestId !== categoryOptionsRequestId) return;
      categoryOptions.value = data.categories;
    } catch {
      // 错误已由拦截器处理
    }
  };

  const clearFilters = () => {
    const shouldReload = hasFilters.value;
    filters.areaId = '';
    filters.category = '';
    filters.unsoldOnly = false;
    if (!shouldReload) {
      load(true);
      loadCategoryOptions();
    }
  };

  const openAnalysis = (row: RecommendPackageItem) => router.push(`/packages/${row.packageId}`);
  const goGenerate = (packageId: string) =>
    router.push({ path: '/generate', query: { packageId } });

  watch(
    () => roleStore.currentRole,
    () => {
      Promise.all([load(true), loadCategoryOptions()]).catch(() => {
        /* 错误已由拦截器处理 */
      });
    }
  );
  watch(
    () => filters.areaId,
    () => {
      Promise.all([load(true), loadCategoryOptions()]).catch(() => {
        /* 错误已由拦截器处理 */
      });
    }
  );
  watch(
    () => filters.category,
    () => {
      load(true).catch(() => {
        /* 错误已由拦截器处理 */
      });
    }
  );
  watch(
    () => filters.unsoldOnly,
    () => {
      load(true).catch(() => {
        /* 错误已由拦截器处理 */
      });
    }
  );

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
    load,
    loadPage,
    clearFilters,
    openAnalysis,
    goGenerate
  };
}
