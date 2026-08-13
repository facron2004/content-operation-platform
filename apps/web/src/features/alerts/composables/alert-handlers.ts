import { ElMessage } from 'element-plus';
import type { Ref } from 'vue';
import type { PaginationMeta } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import type { OperationRecord } from '../../../services/operation-history';
import type { AlertFilters, AlertItem } from './alert-types';

type OperationType = OperationRecord['type'];

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
  setActionError: (value: string | null) => void;
  reload: () => Promise<void>;
}) {
  const ids = [...new Set((p.alertIds ?? []).filter(Boolean))];
  if (!ids.length) {
    ElMessage.warning('当前没有可处理的预警');
    return;
  }
  p.setResolving(true);
  p.setActionError(null);
  try {
    await api.resolveAlerts(ids);
    if (p.requestId !== p.currentRequestId()) return;
    ElMessage.success(p.successText);
    const s = buildResolveSuccessMeta(ids);
    p.recordSuccess(s.type, s.action, s.details);
    await p.reload();
  } catch (error) {
    if (p.requestId !== p.currentRequestId()) return;
    const message = extractErrorMessage(error, '预警处理失败，请稍后重试');
    p.setActionError(message);
    ElMessage.error(message);
    const f = buildResolveErrorMeta(ids, message);
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
  setActionError: (value: string | null) => void;
  load: (force?: boolean) => Promise<void>;
  isActive?: () => boolean;
  canResolve: () => boolean;
};

function createAlertResolveHandlers(args: AlertResolveArgs) {
  const resolveBatch = async (
    alertIds: string[],
    successText = '已标记处理，今日不会再进入待办'
  ) => {
    if (args.isActive && !args.isActive()) return;
    if (!args.canResolve()) return;
    const requestId = args.resolveRequestId();
    await resolveAlertBatch({
      alertIds,
      successText,
      requestId,
      currentRequestId: args.currentResolveRequestId,
      setResolving: args.setResolving,
      recordSuccess: args.recordSuccess,
      recordError: args.recordError,
      setActionError: args.setActionError,
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
  filters: AlertFilters;
  pagination: Omit<PaginationMeta, 'totalPages'>;
  load: (force?: boolean) => Promise<void>;
  isActive?: () => boolean;
}) {
  return {
    clearFilters: () => {
      if (args.isActive && !args.isActive()) return;
      args.filters.keyword = '';
      args.filters.level = '';
      args.filters.type = '';
      args.filters.date = '';
    },
    handlePageChange: () => {
      if (args.isActive && !args.isActive()) return;
      return args.load();
    },
    handleSizeChange: () => {
      if (args.isActive && !args.isActive()) return;
      args.pagination.page = 1;
      args.load();
    }
  };
}

export function useAlertHandlers(
  args: AlertResolveArgs & {
    filters: AlertFilters;
    pagination: Omit<PaginationMeta, 'totalPages'>;
  }
) {
  return { ...createAlertResolveHandlers(args), ...createAlertFilterHandlers(args) };
}
