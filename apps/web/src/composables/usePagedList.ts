import { computed, reactive, ref, watch, type Ref, type UnwrapRef, type ComputedRef } from 'vue';

export interface PagedListReturn<T, F extends Record<string, string>> {
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
}

export interface UsePagedListOptions {
  /** Debounce delay for filter changes (ms). Default 500. Set 0 to disable. */
  filterDebounceMs?: number;
  /** Default page size. Default 20. */
  defaultPageSize?: number;
  /** Called after load to handle errors (e.g., toast). If not set, error is set on the error ref. */
  onError?: (message: string) => void;
}

/**
 * Shared composable for paged list views with filter debounce and stale-response guard.
 *
 * Inspired by alert-core's requestId + debounce pattern.
 * Eliminates ~40 lines of pagination boilerplate per list view.
 */
export function usePagedList<T, F extends Record<string, string>>(
  fetcher: (params: { page: number; pageSize: number; filters: F; force: boolean }) => Promise<{
    items: T[];
    total: number;
  }>,
  defaultFilters: F,
  options: UsePagedListOptions = {}
): PagedListReturn<T, F> {
  const { filterDebounceMs = 500, defaultPageSize = 20, onError } = options;

  const items = ref<T[]>([]) as Ref<T[]>;
  const loading = ref(false);
  const error = ref<string | null>(null);
  const page = ref(1);
  const pageSize = ref(defaultPageSize);
  const total = ref(0);
  const filters = reactive<F>({ ...defaultFilters });
  const requestId = ref(0);
  const filterTimer = ref<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function load(force = false): Promise<void> {
    const rid = ++requestId.value;
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
    page.value = nextPage;
    load();
  }

  function setPageSize(nextPageSize: number): void {
    pageSize.value = nextPageSize;
    page.value = 1;
    load();
  }

  function refresh(): void {
    page.value = 1;
    load(true);
  }

  function updateFilter(patch: Partial<F>): void {
    Object.assign(filters, patch);
    page.value = 1;
    // If debounce is disabled, load immediately; otherwise the watcher handles it
    if (filterDebounceMs === 0) {
      load();
    }
  }

  async function reloadCurrentPage(): Promise<void> {
    await load();
    if (!items.value.length && page.value > 1) {
      page.value -= 1;
      await load();
    }
  }

  // Debounced filter watching
  if (filterDebounceMs > 0) {
    watch(
      () => Object.values(filters) as string[],
      () => {
        if (filterTimer.value) clearTimeout(filterTimer.value);
        filterTimer.value = setTimeout(() => {
          page.value = 1;
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
    updateFilter
  };
}
