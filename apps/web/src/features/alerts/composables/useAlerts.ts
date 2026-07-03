import { computed, ref, reactive, watch, onBeforeUnmount, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { OperationAlert } from '@content/shared';
import { api } from '../../../services/api';
import { clearAlertCache } from '../../../services/cache.service';
import { useOperationHistory } from '../../../services/operation-history';
import { extractErrorMessage } from '../../../services/http-client';

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

interface AlertItem extends OperationAlert {
  priorityScore?: number;
}

interface AlertResponse {
  items: AlertItem[];
  summary: AlertSummary;
  topPackages: AlertPackageFocus[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export function useAlerts(role: Ref<string | undefined>) {
  const loading = ref(false);
  const resolving = ref(false);
  const loadError = ref<string | null>(null);
  const alerts = ref<AlertItem[]>([]);
  const alertResponse = ref<AlertResponse | null>(null);
  const filters = reactive({ keyword: '', level: '', type: '' });
  const pagination = reactive({ page: 1, pageSize: 80, total: 0, totalPages: 1 });
  let filterTimer: ReturnType<typeof window.setTimeout> | undefined;
  let loadRequestId = 0; // Race condition guard
  let resolveRequestId = 0;

  const { recordSuccess, recordError } = useOperationHistory();

  const fallbackSummary: AlertSummary = {
    totalCount: 0,
    activeCount: 0,
    resolvedCount: 0,
    dangerCount: 0,
    warningCount: 0,
    infoCount: 0,
    packageCount: 0,
    typeDistribution: {}
  };

  const summary = computed(() => alertResponse.value?.summary ?? fallbackSummary);
  const topPackages = computed(() => alertResponse.value?.topPackages ?? []);

  const load = async (force = false) => {
    const requestId = ++loadRequestId;
    loading.value = true;
    loadError.value = null;
    try {
      if (force) clearAlertCache();
      const data = (await api.getAlerts({
        role: role.value,
        keyword: filters.keyword.trim() || undefined,
        level: filters.level || undefined,
        type: filters.type || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize
      })) as AlertResponse;
      // Race condition guard: discard stale responses
      if (requestId !== loadRequestId) return;
      alertResponse.value = data;
      alerts.value = data.items ?? [];
      pagination.page = data.pagination?.page ?? pagination.page;
      pagination.pageSize = data.pagination?.pageSize ?? pagination.pageSize;
      pagination.total = data.pagination?.total ?? alerts.value.length;
      pagination.totalPages = data.pagination?.totalPages ?? 1;
    } catch {
      if (requestId !== loadRequestId) return;
      loadError.value = '预警数据加载失败，请稍后重试';
    } finally {
      if (requestId === loadRequestId) {
        loading.value = false;
      }
    }
  };

  const resolve = async (alertId: string) => {
    await resolveBatch([alertId]);
  };

  const resolveBatch = async (
    alertIds: string[],
    successText = '已标记处理，今日不会再进入待办'
  ) => {
    const requestId = ++resolveRequestId;
    const ids = [...new Set((alertIds ?? []).filter(Boolean))];
    if (!ids.length) {
      ElMessage.warning('当前没有可处理的预警');
      return;
    }

    resolving.value = true;
    try {
      await api.resolveAlerts(ids);
      if (requestId !== resolveRequestId) return;
      ElMessage.success(successText);

      // 记录操作历史
      recordSuccess(
        ids.length === 1 ? 'alert_resolve' : 'alert_batch_resolve',
        ids.length === 1 ? '处理预警' : `批量处理 ${ids.length} 条预警`,
        { alertIds: ids, count: ids.length }
      );

      await load();
    } catch (error) {
      if (requestId !== resolveRequestId) return;
      ElMessage.error('操作失败，请稍后重试');

      // 记录失败
      recordError(
        ids.length === 1 ? 'alert_resolve' : 'alert_batch_resolve',
        ids.length === 1 ? '处理预警失败' : `批量处理 ${ids.length} 条预警失败`,
        extractErrorMessage(error, '未知错误'),
        { alertIds: ids }
      );
    } finally {
      if (requestId === resolveRequestId) {
        resolving.value = false;
      }
    }
  };

  const resolveCurrentPage = async () => {
    await resolveBatch(
      alerts.value.map((a) => a.alertId),
      `已处理当前页 ${alerts.value.length} 条预警`
    );
  };

  const clearFilters = () => {
    filters.keyword = '';
    filters.level = '';
    filters.type = '';
  };

  const handlePageChange = () => {
    load();
  };

  const handleSizeChange = () => {
    pagination.page = 1;
    load();
  };

  watch(
    () => [filters.keyword, filters.level, filters.type],
    () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        pagination.page = 1;
        load();
      }, 500);
    }
  );

  // 角色切换时自动刷新数据
  watch(role, () => {
    pagination.page = 1;
    load(true);
  });

  onBeforeUnmount(() => {
    if (filterTimer) {
      clearTimeout(filterTimer);
    }
    loadRequestId += 1;
    resolveRequestId += 1;
  });

  return {
    loading,
    resolving,
    loadError,
    alerts,
    summary,
    topPackages,
    filters,
    pagination,
    load,
    resolve,
    resolveBatch,
    resolveCurrentPage,
    clearFilters,
    handlePageChange,
    handleSizeChange
  };
}
