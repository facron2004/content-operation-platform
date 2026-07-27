import { computed, reactive, ref, watch, type Ref, type UnwrapRef, type ComputedRef } from 'vue';

/** Filter bag values accepted by list views (string selects, booleans, optional empties). */
export type FilterPrimitive = string | number | boolean | null | undefined;

export interface PagedListReturn<T, F extends object> {
  items: Ref<T[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  pagination: ComputedRef<{ current: number; pageSize: number; total: number }>;
  filters: UnwrapRef<F>;
  load: (force?: boolean) => Promise<void>;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  refresh: () => void;
  reloadCurrentPage: () => Promise<void>;
  updateFilter: (patch: Partial<F>) => void;
  /** Replace all filter fields (keeps reactive identity for v-model). */
  resetFilters: (next?: F) => void;
}

export interface UsePagedListOptions {
  /** Debounce delay for filter changes (ms). Default 500. Set 0 to disable. */
  filterDebounceMs?: number;
  /** Default page size. Default 20. */
  defaultPageSize?: number;
  /**
   * Soft-cache recently visited pages in memory so flipping back is instant.
   * Keyed by page+pageSize+filters. Default 8 pages. Set 0 to disable.
   */
  pageCacheSize?: number;
  /** Called after load to handle errors (e.g., toast). If not set, error is set on the error ref. */
  onError?: (message: string) => void;
}

/**
 * Shared composable for paged list views with filter debounce and stale-response guard.
 *
 * Inspired by alert-core's requestId + debounce pattern.
 * Eliminates ~40 lines of pagination boilerplate per list view.
 */
export function usePagedList<T, F extends object>(
  fetcher: (params: { page: number; pageSize: number; filters: F; force: boolean }) => Promise<{
    items: T[];
    total: number;
  }>,
  defaultFilters: F,
  options: UsePagedListOptions = {}
): PagedListReturn<T, F> {
  const { filterDebounceMs = 500, defaultPageSize = 20, pageCacheSize = 8, onError } = options;

  /** Client clamp mirrors server LIST_PAGE_MAX / pageSize Max — never send unbounded. */
  const PAGE_SIZE_MAX = 200;
  const PAGE_MAX = 500;
  const clampPage = (p: number) => {
    const n = Math.floor(Number(p));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(PAGE_MAX, n);
  };
  const clampPageSize = (s: number) => {
    const n = Math.floor(Number(s));
    if (!Number.isFinite(n) || n < 1) return 20;
    return Math.min(PAGE_SIZE_MAX, n);
  };

  const items = ref<T[]>([]) as Ref<T[]>;
  const loading = ref(false);
  const error = ref<string | null>(null);
  const page = ref(1);
  const pageSize = ref(clampPageSize(defaultPageSize));
  const total = ref(0);
  const filters = reactive<F>({ ...defaultFilters });
  const requestId = ref(0);
  const filterTimer = ref<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** LRU map of cacheKey → { items, total }. Insertion order = LRU. */
  const pageCache = new Map<string, { items: T[]; total: number }>();

  function cacheKey(p: number, size: number, f: F): string {
    return `${p}|${size}|${JSON.stringify(f)}`;
  }

  function rememberPage(key: string, payload: { items: T[]; total: number }): void {
    if (pageCacheSize <= 0) return;
    if (pageCache.has(key)) pageCache.delete(key);
    pageCache.set(key, payload);
    while (pageCache.size > pageCacheSize) {
      const oldest = pageCache.keys().next().value;
      if (oldest === undefined) break;
      pageCache.delete(oldest);
    }
  }

  function clearPageCache(): void {
    pageCache.clear();
  }

  async function load(force = false): Promise<void> {
    const rid = ++requestId.value;
    const key = cacheKey(page.value, pageSize.value, { ...filters } as F);
    if (!force && pageCacheSize > 0) {
      const hit = pageCache.get(key);
      if (hit) {
        // Promote to newest (LRU).
        pageCache.delete(key);
        pageCache.set(key, hit);
        items.value = hit.items;
        total.value = hit.total;
        loading.value = false;
        error.value = null;
        return;
      }
    }

    // Keep previous items visible while fetching so the table doesn't blank.
    loading.value = true;
    error.value = null;
    try {
      const data = await fetcher({
        page: page.value,
        pageSize: pageSize.value,
        filters: { ...filters } as F,
        force
      });
      // Stale-response guard: skip if a newer request has been issued
      if (rid !== requestId.value) return;
      items.value = data.items;
      total.value = data.total;
      rememberPage(key, { items: data.items, total: data.total });
    } catch (err) {
      if (rid === requestId.value) {
        const msg = err instanceof Error ? err.message : '加载失败';
        error.value = msg;
        if (onError) onError(msg);
      }
    } finally {
      if (rid === requestId.value) loading.value = false;
    }
  }

  function setPage(nextPage: number): void {
    page.value = clampPage(nextPage);
    load();
  }

  function setPageSize(nextPageSize: number): void {
    pageSize.value = clampPageSize(nextPageSize);
    page.value = 1;
    clearPageCache();
    load();
  }

  function refresh(): void {
    page.value = 1;
    clearPageCache();
    load(true);
  }

  function updateFilter(patch: Partial<F>): void {
    Object.assign(filters, patch);
    page.value = 1;
    clearPageCache();
    // If debounce is disabled, load immediately; otherwise the watcher handles it
    if (filterDebounceMs === 0) {
      load();
    }
  }

  function resetFilters(next?: F): void {
    const source = next ?? defaultFilters;
    // Clear then re-apply so removed optional keys (e.g. isActive) don't stick.
    for (const key of Object.keys(filters as object)) {
      delete (filters as Record<string, unknown>)[key];
    }
    Object.assign(filters, source);
    page.value = 1;
    clearPageCache();
    if (filterDebounceMs === 0) {
      load();
    }
  }

  async function reloadCurrentPage(): Promise<void> {
    // Mutations (delete/edit) must bypass the soft page cache.
    clearPageCache();
    await load(true);
    if (!items.value.length && page.value > 1) {
      page.value -= 1;
      await load(true);
    }
  }

  // Debounced filter watching
  if (filterDebounceMs > 0) {
    watch(
      () => Object.values(filters as object),
      () => {
        if (filterTimer.value) clearTimeout(filterTimer.value);
        filterTimer.value = setTimeout(() => {
          page.value = 1;
          clearPageCache();
          load();
        }, filterDebounceMs);
      }
    );
  }

  const pagination = computed(() => ({
    current: page.value,
    pageSize: pageSize.value,
    total: total.value
  }));

  return {
    items,
    loading,
    error,
    pagination,
    filters: filters as UnwrapRef<F>,
    load,
    setPage,
    setPageSize,
    refresh,
    reloadCurrentPage,
    updateFilter,
    resetFilters
  };
}
