import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type {
  DistributionExecution,
  TaskDetailResponse,
  TaskPerformanceResponse
} from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

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
  const task = ref<TaskDetailResponse | null>(null);
  const executions = ref<DistributionExecution[]>([]);
  // Residual #260: timeline ASC LIMIT honesty (SKU #250 parity).
  const executionsTruncated = ref(false);
  const executionsLimit = ref<number | null>(null);
  // Residual #182: task-scoped TPD performance (not platform task-status KPIs).
  const performance = ref<TaskPerformanceResponse | null>(null);

  function applyTimelineMeta(detail: TaskDetailResponse) {
    executions.value = detail.executions ?? [];
    executionsTruncated.value = detail.executionsTruncated === true;
    executionsLimit.value =
      typeof detail.executionsLimit === 'number' && Number.isFinite(detail.executionsLimit)
        ? detail.executionsLimit
        : null;
  }

  async function loadDetail() {
    loading.value = true;
    try {
      // Residual #174: never fan out to platform task-status KPIs (list page owns those).
      // Residual #182: parallel task-scoped getTaskPerformance for the detail card.
      const [detail, perf] = await Promise.all([
        api.getTask(taskId),
        api.getTaskPerformance(taskId).catch(() => null)
      ]);
      task.value = detail;
      applyTimelineMeta(detail);
      performance.value = perf;
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '加载任务详情失败'));
    } finally {
      loading.value = false;
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

  async function refreshTaskTimeline(): Promise<void> {
    // Row + executions only — KPIs are platform-wide and live on the list page.
    const detail = await api.getTask(taskId);
    task.value = detail;
    applyTimelineMeta(detail);
  }

  async function publish(data: { evidenceUrl?: string; note?: string }) {
    try {
      // Residual #174: discard mutate body; timeline re-GET is authoritative.
      await api.publishTask(taskId, data);
      ElMessage.success('任务已发布');
      await refreshTaskTimeline();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '发布任务失败'));
    }
  }

  async function fail(data: {
    failReason: string;
    failCategory?: string;
    evidenceUrl?: string;
    note?: string;
  }) {
    try {
      await api.failTask(taskId, data);
      ElMessage.success('任务已标记为失败');
      await refreshTaskTimeline();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '标记失败失败'));
    }
  }

  async function cancel(data: { reason: string; note?: string }) {
    try {
      // Residual #175: body key is `reason` (matches CancelTaskDto).
      await api.cancelTask(taskId, data);
      ElMessage.success('任务已取消');
      await refreshTaskTimeline();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '取消任务失败'));
    }
  }

  async function reassign(data: { assigneeId: string; note?: string }) {
    try {
      const result = await api.reassignTask(taskId, data);
      // Reassign does not append executions — body-only is enough (no second GET).
      applyTaskRow(result);
      ElMessage.success('任务已重新分配');
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '重新分配失败'));
    }
  }

  // Residual #180: schedule/complete were API-only — SPA had no client or affordance
  // after #176 tightened publish/fail to scheduled-only (draft stuck, published stuck).
  async function schedule(data: { plannedAt: string }) {
    try {
      await api.scheduleTask(taskId, data);
      ElMessage.success('任务已排期');
      await refreshTaskTimeline();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '排期失败'));
    }
  }

  async function complete() {
    try {
      await api.completeTask(taskId);
      ElMessage.success('任务已完成');
      await refreshTaskTimeline();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '完成任务失败'));
    }
  }

  onMounted(() => {
    void loadDetail();
  });

  return {
    loading,
    task,
    executions,
    executionsTruncated,
    executionsLimit,
    performance,
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
