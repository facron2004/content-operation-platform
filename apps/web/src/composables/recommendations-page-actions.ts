import { watch, type ComputedRef, type Reactive } from 'vue';
import type { Router } from 'vue-router';
import type { PaginationMeta, RecommendPackageItem, UserRole } from '@content/shared';

export type RecommendationsPageFilters = {
  areaId: string;
  merchantId: string;
  category: string;
  unsoldOnly: boolean;
  inventoryMin: string;
  inventoryMax: string;
  date: string;
};

const swallowHandled = <T>(promise: Promise<T>): void => {
  promise.catch(() => undefined);
};

export function createRecommendationsPageActions(params: {
  filters: Reactive<RecommendationsPageFilters>;
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

export function bindRecommendationsWatches(options: {
  roleStore: { currentRole: UserRole };
  filters: RecommendationsPageFilters;
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
