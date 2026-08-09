import { reactive, ref, watch, type Ref } from 'vue';
import type { PaginationMeta } from '@content/shared';
import { api } from '../../../services/api';
import { clearAlertCache } from '../../../services/cache.service';
import type { AlertItem, AlertPageCache, AlertResponse } from './alert-types';

// Compatibility barrel: existing imports keep the historical alert-core path.
export * from './alert-types';
export * from './alert-handlers';
export * from './alert-summary';

// --- state + loaders ---
export function createAlertState() {
  return {
    loading: ref(false),
    resolving: ref(false),
    loadError: ref<string | null>(null),
    actionError: ref<string | null>(null),
    alerts: ref<AlertItem[]>([]),
    alertResponse: ref<AlertResponse | null>(null),
    // Residual #221: date as-of (AlertQueryDto.date) — empty = today server-side.
    filters: reactive({ keyword: '', level: '', type: '', date: '' }),
    pagination: reactive<Omit<PaginationMeta, 'totalPages'>>({ page: 1, pageSize: 80, total: 0 }),
    filterTimer: ref<ReturnType<typeof window.setTimeout> | undefined>(undefined),
    loadRequestId: ref(0),
    resolveRequestId: ref(0),
    /** Soft page LRU — page flips reuse payload without blanking the table. */
    pageCache: new Map() as AlertPageCache
  };
}

export function clearAlertFilterTimer(state: ReturnType<typeof createAlertState>): void {
  if (!state.filterTimer.value) return;
  clearTimeout(state.filterTimer.value);
  state.filterTimer.value = undefined;
}

export async function loadAlertsPage(p: {
  role?: string;
  keyword: string;
  level: string;
  type: string;
  // Residual #221: as-of business day for inventory window.
  date: string;
  pagination: Omit<PaginationMeta, 'totalPages'>;
  force: boolean;
  requestId: number;
  currentRequestId: () => number;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setResponse: (data: AlertResponse) => void;
  setItems: (items: AlertItem[]) => void;
  pageCache?: AlertPageCache;
  pageCacheSize?: number;
}) {
  const {
    role,
    keyword,
    level,
    type,
    date,
    pagination: pg,
    force,
    requestId: rid,
    currentRequestId: cur,
    setLoading,
    setError,
    setResponse,
    setItems
  } = p;
  const cacheSize = p.pageCacheSize ?? 8;
  const cacheKey = [pg.page, pg.pageSize, role ?? '', keyword.trim(), level, type, date].join('|');
  if (!force && p.pageCache && cacheSize > 0) {
    const hit = p.pageCache.get(cacheKey);
    if (hit) {
      p.pageCache.delete(cacheKey);
      p.pageCache.set(cacheKey, hit);
      setResponse(hit.response);
      setItems(hit.items);
      pg.total = hit.total;
      setLoading(false);
      setError(null);
      return;
    }
  }
  // Keep previous items visible while fetching so page flips don't blank.
  setLoading(true);
  setError(null);
  try {
    if (force) {
      clearAlertCache();
      p.pageCache?.clear();
    }
    const data = (await api.getAlerts({
      role,
      keyword: keyword.trim() || undefined,
      level: level || undefined,
      type: type || undefined,
      // Residual #221: forward as-of date when set.
      date: date || undefined,
      page: pg.page,
      pageSize: pg.pageSize
    })) as AlertResponse;
    if (rid !== cur()) return;
    setResponse(data);
    setItems(data.items ?? []);
    pg.page = data.pagination?.page ?? pg.page;
    pg.pageSize = data.pagination?.pageSize ?? pg.pageSize;
    pg.total = data.pagination?.total ?? data.items?.length ?? 0;
    if (p.pageCache && cacheSize > 0) {
      if (p.pageCache.has(cacheKey)) p.pageCache.delete(cacheKey);
      p.pageCache.set(cacheKey, {
        items: data.items ?? [],
        total: pg.total,
        response: data
      });
      while (p.pageCache.size > cacheSize) {
        const oldest = p.pageCache.keys().next().value;
        if (oldest === undefined) break;
        p.pageCache.delete(oldest);
      }
    }
  } catch {
    if (rid === cur()) setError('预警数据加载失败，请稍后重试');
  } finally {
    if (rid === cur()) setLoading(false);
  }
}

export function createAlertLoader(
  state: ReturnType<typeof createAlertState>,
  role: Ref<string | undefined>
) {
  return async (force = false) => {
    clearAlertFilterTimer(state);
    const requestId = ++state.loadRequestId.value;
    await loadAlertsPage({
      role: role.value,
      keyword: state.filters.keyword,
      level: state.filters.level,
      type: state.filters.type,
      date: state.filters.date,
      pagination: state.pagination,
      force,
      requestId,
      currentRequestId: () => state.loadRequestId.value,
      setLoading: (v) => {
        state.loading.value = v;
      },
      setError: (v) => {
        state.loadError.value = v;
      },
      setResponse: (data) => {
        state.alertResponse.value = data;
      },
      setItems: (items) => {
        state.alerts.value = items;
      },
      pageCache: state.pageCache
    });
  };
}

export function bindAlertWatchers(args: {
  filters: { keyword: string; level: string; type: string; date: string };
  pagination: Omit<PaginationMeta, 'totalPages'>;
  role: Ref<string | undefined>;
  load: (force?: boolean) => Promise<void> | void;
  isActive?: () => boolean;
  setFilterTimer: (timer: ReturnType<typeof window.setTimeout> | undefined) => void;
  getFilterTimer: () => ReturnType<typeof window.setTimeout> | undefined;
}) {
  watch(
    () => [args.filters.keyword, args.filters.level, args.filters.type, args.filters.date],
    () => {
      if (args.isActive && !args.isActive()) return;
      const prev = args.getFilterTimer();
      if (prev) clearTimeout(prev);
      args.setFilterTimer(
        setTimeout(() => {
          args.pagination.page = 1;
          void args.load();
        }, 500)
      );
    }
  );
  watch(args.role, () => {
    if (args.isActive && !args.isActive()) return;
    args.pagination.page = 1;
    void args.load(true);
  });
}
