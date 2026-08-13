import { type Reactive, type Ref } from 'vue';
import type { PaginationMeta, RecommendPackageItem, UserRole } from '@content/shared';
import { api } from '../services/api';
import { clearPackageCache } from '../services/cache.service';
import { extractErrorMessage } from '../services/http-client';

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
  categoryError: Ref<string | null>;
  isDisposed?: () => boolean;
}) {
  if (options.isDisposed?.()) return;
  options.categoryError.value = null;
  try {
    const data = await api.getCategories({
      areaId: options.areaId || undefined,
      role: options.role
    });
    if (options.isDisposed?.() || options.requestId !== options.currentRequestId()) return;
    options.categoryOptions.value = data.categories;
  } catch (error) {
    if (!options.isDisposed?.() && options.requestId === options.currentRequestId()) {
      options.categoryError.value = extractErrorMessage(error, '推荐分类加载失败，请稍后重试');
    }
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
  loadError: Ref<string | null>;
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
  isDisposed?: () => boolean;
}) {
  if (o.isDisposed?.()) return;
  const cacheSize = o.pageCacheSize ?? 8;
  const invMin = o.filters.inventoryMin.trim();
  const invMax = o.filters.inventoryMax.trim();
  const asOfDate = o.filters.date.trim();
  if (o.force) {
    clearPackageCache();
    o.pagination.page = 1;
    o.pageCache?.clear();
  }
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
      o.loadError.value = null;
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
  o.loadError.value = null;
  try {
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
      pageSize: o.pagination.pageSize,
      force: o.force || undefined
    });
    if (o.isDisposed?.() || o.requestId !== o.currentRequestId()) return;
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
  } catch (error) {
    if (o.requestId === o.currentRequestId() && !o.isDisposed?.()) {
      o.loadError.value = extractErrorMessage(error, '推荐套餐加载失败，请稍后重试');
    }
  } finally {
    if (o.requestId === o.currentRequestId() && !o.isDisposed?.()) o.loading.value = false;
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
  loadError: Ref<string | null>;
  items: Ref<RecommendPackageItem[]>;
  areaOptions: Ref<Array<{ value: string; label: string }>>;
  categoryOptions: Ref<string[]>;
  categoryError: Ref<string | null>;
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
  isDisposed?: () => boolean;
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
      loadError: params.loadError,
      items: params.items,
      areaOptions: params.areaOptions,
      pageCache: params.pageCache,
      listTruncated: params.listTruncated,
      listLimit: params.listLimit,
      matchedCount: params.matchedCount,
      isDisposed: params.isDisposed
    });
  };
  const loadCategoryOptions = async () => {
    const requestId = ++categoryOptionsRequestId;
    await loadRecommendCategoryOptions({
      areaId: params.filters.areaId,
      role: params.roleStore.currentRole,
      requestId,
      currentRequestId: () => categoryOptionsRequestId,
      categoryOptions: params.categoryOptions,
      categoryError: params.categoryError,
      isDisposed: params.isDisposed
    });
  };
  return { load, loadCategoryOptions };
}
