import { onMounted, onScopeDispose, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type {
  DistributionExecution,
  TaskDetailResponse,
  TaskPerformanceResponse
} from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

type PerformanceLoadResult = {
  value: TaskPerformanceResponse | null;
  error?: unknown;
};

function isTaskRow(value: unknown): value is TaskDetailResponse {
  return (
    !!value &&
    typeof value === 'object' &&
    'taskId' in value &&
    typeof (value as { taskId: unknown }).taskId === 'string'
  );
}

export function useTaskDetail(taskId: string) {
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const task = ref<TaskDetailResponse | null>(null);
  const actionError = ref<string | null>(null);
  const executions = ref<DistributionExecution[]>([]);
  // Residual #260: timeline ASC LIMIT honesty (SKU #250 parity).
  const executionsTruncated = ref(false);
  const executionsLimit = ref<number | null>(null);
  // Residual #182: task-scoped TPD performance (not platform task-status KPIs).
  const performance = ref<TaskPerformanceResponse | null>(null);
  const performanceError = ref<string | null>(null);
  let requestSequence = 0;
  let disposed = false;

  function beginRequest(): number | null {
    if (disposed) return null;
    requestSequence += 1;
    return requestSequence;
  }

  function isCurrentRequest(requestId: number): boolean {
    return !disposed && requestId === requestSequence;
  }

  function applyTimelineMeta(detail: TaskDetailResponse) {
    executions.value = detail.executions ?? [];
    executionsTruncated.value = detail.executionsTruncated === true;
    executionsLimit.value =
      typeof detail.executionsLimit === 'number' && Number.isFinite(detail.executionsLimit)
        ? detail.executionsLimit
        : null;
  }

  async function loadDetail() {
    const requestId = beginRequest();
    if (requestId === null) return;
    loading.value = true;
    loadError.value = null;
    performanceError.value = null;
    try {
      // Residual #174: never fan out to platform task-status KPIs (list page owns those).
      // Residual #182: parallel task-scoped getTaskPerformance for the detail card.
      const [detail, perf] = await Promise.all([
        api.getTask(taskId),
        api.getTaskPerformance(taskId).then<PerformanceLoadResult, PerformanceLoadResult>(
          (value) => ({ value }),
          (error: unknown) => ({ value: null, error })
        )
      ]);
      if (!isCurrentRequest(requestId)) return;
      task.value = detail;
      applyTimelineMeta(detail);
      performance.value = perf.value;
      if (perf.error) {
        performanceError.value = extractErrorMessage(perf.error, '加载任务表现失败');
      }
    } catch (err) {
      if (isCurrentRequest(requestId)) {
        loadError.value = extractErrorMessage(err, '加载任务详情失败');
        ElMessage.error(loadError.value);
      }
    } finally {
      if (isCurrentRequest(requestId)) loading.value = false;
    }
  }

  /**
   * Residual #127: apply mutate body (row-only from #116/#118).
   * Residual #146: status mutators return a list shell (no body/cta/trackingCode) —
   * merge over prior detail so free-form fields survive reassign (body-only path).
   * Residual #174: publish/fail/cancel no longer call this before refreshTaskTimeline
   * (timeline re-GET fully replaces task+executions); reassign remains body-only.
   */
  function applyTaskRow(result: unknown): void {
    if (!isTaskRow(result)) return;
    const prev = task.value;
    // Slim shells omit free-form keys as undefined — keep prior detail values.
    task.value = {
      ...prev,
      ...result,
      body: result.body ?? prev?.body,
      cta: result.cta ?? prev?.cta,
      trackingCode: result.trackingCode ?? prev?.trackingCode,
      executions: result.executions ?? prev?.executions ?? []
    };
  }

  async function refreshTaskTimeline(requestId: number): Promise<void> {
    // Row + executions only — KPIs are platform-wide and live on the list page.
    if (!isCurrentRequest(requestId)) return;
    const detail = await api.getTask(taskId);
    if (!isCurrentRequest(requestId)) return;
    task.value = detail;
    applyTimelineMeta(detail);
  }

  async function runMutation<T>(
    action: () => Promise<T>,
    successMessage: string,
    errorFallback: string,
    options: { refresh?: boolean; applyResult?: (result: T) => void } = {}
  ): Promise<boolean> {
    const requestId = beginRequest();
    if (requestId === null) return false;
    actionError.value = null;
    try {
      const result = await action();
      if (!isCurrentRequest(requestId)) return false;
      options.applyResult?.(result);
      ElMessage.success(successMessage);
      if (options.refresh) {
        try {
          await refreshTaskTimeline(requestId);
        } catch (err) {
          if (isCurrentRequest(requestId)) {
            actionError.value = extractErrorMessage(err, '刷新任务详情失败');
            ElMessage.error(actionError.value);
          }
        }
      }
      return true;
    } catch (err) {
      if (isCurrentRequest(requestId)) {
        actionError.value = extractErrorMessage(err, errorFallback);
        ElMessage.error(actionError.value);
      }
      return false;
    }
  }

  async function publish(data: { evidenceUrl?: string; note?: string }) {
    const version = task.value?.updatedAt;
    if (!version) return false;
    // Residual #174: discard mutate body; timeline re-GET is authoritative.
    return runMutation(() => api.publishTask(taskId, data, version), '任务已发布', '发布任务失败', {
      refresh: true
    });
  }

  async function fail(data: {
    failReason: string;
    failCategory?: string;
    evidenceUrl?: string;
    note?: string;
  }) {
    return runMutation(() => api.failTask(taskId, data), '任务已标记为失败', '标记失败失败', {
      refresh: true
    });
  }

  async function cancel(data: { reason: string; note?: string }) {
    // Residual #175: body key is `reason` (matches CancelTaskDto.reason).
    return runMutation(() => api.cancelTask(taskId, data), '任务已取消', '取消任务失败', {
      refresh: true
    });
  }

  async function reassign(data: { assigneeId: string; note?: string }) {
    // Reassign does not append executions — body-only is enough (no second GET).
    return runMutation(() => api.reassignTask(taskId, data), '任务已重新分配', '重新分配失败', {
      applyResult: applyTaskRow
    });
  }

  // Residual #180: schedule/complete were API-only — SPA had no client or affordance
  // after #176 tightened publish/fail to scheduled-only (draft stuck, published stuck).
  async function schedule(data: { plannedAt: string }) {
    return runMutation(() => api.scheduleTask(taskId, data), '任务已排期', '排期失败', {
      refresh: true
    });
  }

  async function complete() {
    return runMutation(() => api.completeTask(taskId), '任务已完成', '完成任务失败', {
      refresh: true
    });
  }

  onMounted(() => {
    void loadDetail();
  });

  onScopeDispose(() => {
    disposed = true;
    requestSequence += 1;
    loading.value = false;
  });

  return {
    loading,
    loadError,
    actionError,
    task,
    executions,
    executionsTruncated,
    executionsLimit,
    performance,
    performanceError,
    loadDetail,
    publish,
    fail,
    cancel,
    reassign,
    schedule,
    complete,
    publishTask: publish,
    failTask: fail,
    cancelTask: cancel,
    reassignTask: reassign,
    scheduleTask: schedule,
    completeTask: complete
  };
}
