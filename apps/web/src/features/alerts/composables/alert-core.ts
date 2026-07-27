import { ElMessage } from 'element-plus';
import { computed, reactive, ref, watch, type Ref } from 'vue';
import type { OperationAlert, PaginationMeta } from '@content/shared';
import { api } from '../../../services/api';
import { clearAlertCache } from '../../../services/cache.service';
import { extractErrorMessage } from '../../../services/http-client';
import type { OperationRecord } from '../../../services/operation-history';

// --- types ---
export interface AlertSummary {
  totalCount: number;
  activeCount: number;
  resolvedCount: number;
  dangerCount: number;
  warningCount: number;
  infoCount: number;
  packageCount: number;
  typeDistribution: Record<string, number>;
}
export interface AlertPackageFocus {
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  alertCount: number;
  dangerCount: number;
  warningCount: number;
  priorityScore: number;
  mainReason: string;
  nextAction: string;
  alertIds: string[];
  types: OperationAlert['type'][];
}
export interface AlertItem extends OperationAlert {
  priorityScore?: number;
}
export interface AlertResponse {
  items: AlertItem[];
  summary: AlertSummary;
  topPackages: AlertPackageFocus[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  // Residual #283: Top-N focus package head honesty.
  focusPackageLimit?: number;
  focusPackageMatched?: number;
  focusPackageTruncated?: boolean;
  // Residual #274: RESOLVED_ALERT_DAY_LIMIT honesty.
  resolvedIdsLimit?: number;
  resolvedIdsLoaded?: number;
  resolvedIdsTruncated?: boolean;
  // Residual #275: RECOMMEND_CACHE_CAP source-cap honesty.
  sourceMatchedCount?: number;
  sourceLimit?: number;
  sourceTruncated?: boolean;
}
export type AlertPagination = Omit<PaginationMeta, 'totalPages'>;
export const EMPTY_ALERT_SUMMARY: AlertSummary = {
  totalCount: 0,
  activeCount: 0,
  resolvedCount: 0,
  dangerCount: 0,
  warningCount: 0,
  infoCount: 0,
  packageCount: 0,
  typeDistribution: {}
};

// --- state + loaders ---
export function createAlertState() {
  return {
    loading: ref(false),
    resolving: ref(false),
    loadError: ref<string | null>(null),
    alerts: ref<AlertItem[]>([]),
    alertResponse: ref<AlertResponse | null>(null),
    // Residual #221: date as-of (AlertQueryDto.date) — empty = today server-side.
    filters: reactive({ keyword: '', level: '', type: '', date: '' }),
    pagination: reactive<Omit<PaginationMeta, 'totalPages'>>({ page: 1, pageSize: 80, total: 0 }),
    filterTimer: ref<ReturnType<typeof window.setTimeout> | undefined>(undefined),
    loadRequestId: ref(0),
    resolveRequestId: ref(0),
    /** Soft page LRU — page flips reuse payload without blanking the table. */
    pageCache: new Map<string, { items: AlertItem[]; total: number; response: AlertResponse }>()
  };
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
  pageCache?: Map<string, { items: AlertItem[]; total: number; response: AlertResponse }>;
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
  setFilterTimer: (timer: ReturnType<typeof window.setTimeout> | undefined) => void;
  getFilterTimer: () => ReturnType<typeof window.setTimeout> | undefined;
}) {
  watch(
    () => [args.filters.keyword, args.filters.level, args.filters.type, args.filters.date],
    () => {
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
    args.pagination.page = 1;
    void args.load(true);
  });
}

// --- handlers ---
type OperationType = OperationRecord['type'];
type Filters = { keyword: string; level: string; type: string; date: string };

function buildResolveSuccessMeta(ids: string[]) {
  const single = ids.length === 1;
  return {
    type: (single ? 'alert_resolve' : 'alert_batch_resolve') as OperationType,
    action: single ? '处理预警' : `批量处理 ${ids.length} 条预警`,
    details: { alertIds: ids, count: ids.length }
  };
}

function buildResolveErrorMeta(ids: string[], error: string) {
  const single = ids.length === 1;
  return {
    type: (single ? 'alert_resolve' : 'alert_batch_resolve') as OperationType,
    action: single ? '处理预警失败' : `批量处理 ${ids.length} 条预警失败`,
    error,
    details: { alertIds: ids }
  };
}

export async function resolveAlertBatch(p: {
  alertIds: string[];
  successText: string;
  requestId: number;
  currentRequestId: () => number;
  setResolving: (v: boolean) => void;
  recordSuccess: (type: OperationType, action: string, details?: Record<string, unknown>) => void;
  recordError: (
    type: OperationType,
    action: string,
    error: string,
    details?: Record<string, unknown>
  ) => void;
  reload: () => Promise<void>;
}) {
  const ids = [...new Set((p.alertIds ?? []).filter(Boolean))];
  if (!ids.length) {
    ElMessage.warning('当前没有可处理的预警');
    return;
  }
  p.setResolving(true);
  try {
    await api.resolveAlerts(ids);
    if (p.requestId !== p.currentRequestId()) return;
    ElMessage.success(p.successText);
    const s = buildResolveSuccessMeta(ids);
    p.recordSuccess(s.type, s.action, s.details);
    await p.reload();
  } catch (error) {
    if (p.requestId !== p.currentRequestId()) return;
    ElMessage.error('操作失败，请稍后重试');
    const f = buildResolveErrorMeta(ids, extractErrorMessage(error, '未知错误'));
    p.recordError(f.type, f.action, f.error, f.details);
  } finally {
    if (p.requestId === p.currentRequestId()) p.setResolving(false);
  }
}

export type AlertResolveArgs = {
  alerts: Ref<AlertItem[]>;
  resolveRequestId: () => number;
  currentResolveRequestId: () => number;
  setResolving: (v: boolean) => void;
  recordSuccess: (type: OperationType, action: string, details?: Record<string, unknown>) => void;
  recordError: (
    type: OperationType,
    action: string,
    error: string,
    details?: Record<string, unknown>
  ) => void;
  load: (force?: boolean) => Promise<void>;
};

function createAlertResolveHandlers(args: AlertResolveArgs) {
  const resolveBatch = async (
    alertIds: string[],
    successText = '已标记处理，今日不会再进入待办'
  ) => {
    const requestId = args.resolveRequestId();
    await resolveAlertBatch({
      alertIds,
      successText,
      requestId,
      currentRequestId: args.currentResolveRequestId,
      setResolving: args.setResolving,
      recordSuccess: args.recordSuccess,
      recordError: args.recordError,
      reload: () => args.load(true)
    });
  };
  return {
    resolve: async (alertId: string) => resolveBatch([alertId]),
    resolveBatch,
    resolveCurrentPage: async () =>
      resolveBatch(
        args.alerts.value.map((a) => a.alertId),
        `已处理当前页 ${args.alerts.value.length} 条预警`
      )
  };
}

function createAlertFilterHandlers(args: {
  filters: Filters;
  pagination: Omit<PaginationMeta, 'totalPages'>;
  load: (force?: boolean) => Promise<void>;
}) {
  return {
    clearFilters: () => {
      args.filters.keyword = '';
      args.filters.level = '';
      args.filters.type = '';
      args.filters.date = '';
    },
    handlePageChange: () => args.load(),
    handleSizeChange: () => {
      args.pagination.page = 1;
      args.load();
    }
  };
}

export function useAlertHandlers(
  args: AlertResolveArgs & {
    filters: Filters;
    pagination: Omit<PaginationMeta, 'totalPages'>;
  }
) {
  return { ...createAlertResolveHandlers(args), ...createAlertFilterHandlers(args) };
}

// --- table summary (used by AlertTable) ---
export function useAlertTableSummary(
  alerts: () => Array<OperationAlert & { priorityScore?: number }>
) {
  const currentPageDangerCount = computed(
    () => alerts().filter((item) => item.level === 'danger').length
  );
  const currentPageWarningCount = computed(
    () => alerts().filter((item) => item.level === 'warning').length
  );
  const currentPageAvgScore = computed(() => {
    const rows = alerts();
    if (!rows.length) return 0;
    return (
      Math.round(
        (rows.reduce((sum, item) => sum + (item.priorityScore ?? 0), 0) / rows.length) * 10
      ) / 10
    );
  });
  const currentPagePackageCount = computed(
    () => new Set(alerts().map((item) => item.packageId)).size
  );
  const alertRowClassName = ({ row }: { row: OperationAlert & { priorityScore?: number } }) =>
    row.level === 'danger' ? 'row-danger' : row.level === 'warning' ? 'row-warning' : '';
  return {
    currentPageDangerCount,
    currentPageWarningCount,
    currentPageAvgScore,
    currentPagePackageCount,
    alertRowClassName
  };
}
