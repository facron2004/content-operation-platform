import { computed, onScopeDispose, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';
import { usePagedList } from '../../composables/usePagedList';
import type { AuditLogRow } from './useAuditLogDetail';

export type AuditFilters = {
  userId: string;
  objectType: string;
  action: string;
  dateFrom: string;
  dateTo: string;
};

type AuditLogListResponse = {
  items?: AuditLogRow[];
  data?: AuditLogRow[];
  total?: number;
  dateFrom?: string;
  dateTo?: string;
};

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  userId: '',
  objectType: '',
  action: '',
  dateFrom: '',
  dateTo: ''
};

export function useAuditLogList() {
  const listDateFrom = ref<string | undefined>();
  const listDateTo = ref<string | undefined>();
  const windowLabel = computed(() => {
    if (listDateFrom.value && listDateTo.value) {
      return `${listDateFrom.value} ~ ${listDateTo.value}`;
    }
    return '近 90 天';
  });

  let disposed = false;
  let requestGeneration = 0;

  const paged = usePagedList<AuditLogRow, AuditFilters>(
    async ({ page, pageSize, filters: f }) => {
      const generation = requestGeneration;
      const params: {
        userId?: string;
        objectType?: string;
        action?: string;
        dateFrom?: string;
        dateTo?: string;
        page: number;
        pageSize: number;
      } = { page, pageSize };
      if (f.userId) params.userId = f.userId;
      if (f.objectType) params.objectType = f.objectType;
      if (f.action) params.action = f.action;
      if (f.dateFrom) params.dateFrom = f.dateFrom;
      if (f.dateTo) params.dateTo = f.dateTo;

      const data = (await api.listAuditLogs(params)) as AuditLogListResponse;
      if (disposed || generation !== requestGeneration) {
        return { items: [], total: 0 };
      }

      // Residual #185: tolerate both the normalized items shape and the legacy data shape.
      const rows = data.items ?? data.data ?? [];
      // Residual #273: keep the effective INTERACTIVE window returned by the API.
      listDateFrom.value = data.dateFrom;
      listDateTo.value = data.dateTo;
      return { items: rows, total: data.total ?? 0 };
    },
    DEFAULT_AUDIT_FILTERS,
    {
      filterDebounceMs: 0,
      onError: (message) => ElMessage.error(extractErrorMessage(message, '加载审计日志失败'))
    }
  );

  function beginRequest(): boolean {
    if (disposed) return false;
    requestGeneration += 1;
    return true;
  }

  async function load(force = false): Promise<void> {
    if (!beginRequest()) return;
    await paged.load(force);
  }

  function setPage(page: number): void {
    if (!beginRequest()) return;
    paged.setPage(page);
  }

  function setPageSize(pageSize: number): void {
    if (!beginRequest()) return;
    paged.setPageSize(pageSize);
  }

  function refresh(): void {
    if (!beginRequest()) return;
    paged.refresh();
  }

  async function reloadCurrentPage(): Promise<void> {
    if (!beginRequest()) return;
    await paged.reloadCurrentPage();
  }

  function updateFilter(patch: Partial<AuditFilters>): void {
    if (!beginRequest()) return;
    paged.updateFilter(patch);
  }

  function resetFilters(): void {
    if (!beginRequest()) return;
    paged.resetFilters(DEFAULT_AUDIT_FILTERS);
  }

  onScopeDispose(() => {
    disposed = true;
    requestGeneration += 1;
  }, true);

  return {
    items: paged.items,
    loading: paged.loading,
    error: paged.error,
    pagination: paged.pagination,
    filters: paged.filters,
    load,
    setPage,
    setPageSize,
    refresh,
    reloadCurrentPage,
    updateFilter,
    resetFilters,
    listDateFrom,
    listDateTo,
    windowLabel
  };
}
