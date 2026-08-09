import { onScopeDispose, ref, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { DistributionTask } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

export type TaskPublishPayload = {
  evidenceUrl?: string;
  note?: string;
};

export type TaskFailPayload = {
  failReason: string;
  failCategory?: string;
  evidenceUrl?: string;
  note?: string;
};

export interface UseTaskCenterActionsOptions {
  refresh: () => Promise<void> | void;
}

type PromptResult = { value: string };
type PromptAction = 'schedule' | 'complete' | 'cancel' | 'reassign';

export interface TaskCenterActions {
  actionError: Ref<string | null>;
  publishDialogVisible: Ref<boolean>;
  publishSubmitting: Ref<boolean>;
  failDialogVisible: Ref<boolean>;
  failSubmitting: Ref<boolean>;
  handleSchedule: (task: DistributionTask) => Promise<void>;
  handlePublish: (task: DistributionTask) => void;
  confirmPublish: (data: TaskPublishPayload) => Promise<void>;
  onPublishClosed: () => void;
  handleComplete: (task: DistributionTask) => Promise<void>;
  handleFail: (task: DistributionTask) => void;
  confirmFail: (data: TaskFailPayload) => Promise<void>;
  onFailClosed: () => void;
  handleCancel: (task: DistributionTask) => Promise<void>;
  handleReassign: (task: DistributionTask) => Promise<void>;
}

/**
 * Keep task-center row mutations out of the page and prevent late feedback
 * from a closed page or a task that was replaced while a dialog was open.
 */
export function useTaskCenterActions({ refresh }: UseTaskCenterActionsOptions): TaskCenterActions {
  const publishDialogVisible = ref(false);
  const publishSubmitting = ref(false);
  const failDialogVisible = ref(false);
  const failSubmitting = ref(false);
  const actionError = ref<string | null>(null);
  const publishTaskId = ref<string | null>(null);
  const publishTaskVersion = ref<string | null>(null);
  const failTaskId = ref<string | null>(null);

  let disposed = false;
  let nextRequestId = 0;
  let publishRequestId = 0;
  let failRequestId = 0;
  const activePromptActions = new Map<string, number>();

  onScopeDispose(() => {
    disposed = true;
    nextRequestId += 1;
    publishRequestId += 1;
    failRequestId += 1;
    activePromptActions.clear();
    publishSubmitting.value = false;
    failSubmitting.value = false;
    publishDialogVisible.value = false;
    failDialogVisible.value = false;
    publishTaskId.value = null;
    publishTaskVersion.value = null;
    failTaskId.value = null;
    actionError.value = null;
  }, true);

  function beginPromptAction(action: PromptAction, taskId: string): [string, number] | null {
    if (disposed) return null;
    const key = `${action}:${taskId}`;
    if (activePromptActions.has(key)) return null;
    const requestId = ++nextRequestId;
    activePromptActions.set(key, requestId);
    return [key, requestId];
  }

  function isCurrentPromptAction(key: string, requestId: number) {
    return !disposed && activePromptActions.get(key) === requestId;
  }

  function endPromptAction(key: string, requestId: number) {
    if (activePromptActions.get(key) === requestId) activePromptActions.delete(key);
  }

  async function runPromptAction(
    task: DistributionTask,
    action: PromptAction,
    prompt: () => Promise<PromptResult>,
    request: (value: string) => Promise<unknown>,
    successMessage: string,
    errorFallback: string
  ) {
    const actionState = beginPromptAction(action, task.taskId);
    if (!actionState) return;
    const [key, requestId] = actionState;
    actionError.value = null;
    let promptConfirmed = false;
    try {
      const { value } = await prompt();
      if (!isCurrentPromptAction(key, requestId)) return;
      promptConfirmed = true;
      await request(value.trim());
      if (!isCurrentPromptAction(key, requestId)) return;
      ElMessage.success(successMessage);
      await refresh();
    } catch (error) {
      if (promptConfirmed && isCurrentPromptAction(key, requestId)) {
        actionError.value = extractErrorMessage(error, errorFallback);
      }
    } finally {
      endPromptAction(key, requestId);
    }
  }

  async function handleSchedule(task: DistributionTask) {
    await runPromptAction(
      task,
      'schedule',
      () =>
        ElMessageBox.prompt(
          `为任务「${task.title || task.taskId}」设置排期时间（如 2026-07-25T10:00:00）`,
          '任务排期',
          {
            confirmButtonText: '确认排期',
            cancelButtonText: '返回',
            inputPlaceholder: 'YYYY-MM-DDTHH:mm:ss',
            inputValue: task.plannedAt?.slice(0, 19) || '',
            inputValidator: (value) => {
              if (!value || !value.trim()) return '请填写排期时间';
              const date = new Date(value.trim());
              return (
                (!Number.isNaN(date.getTime()) && value.trim().length >= 10) || '排期时间格式无效'
              );
            }
          }
        ),
      (value) => api.scheduleTask(task.taskId, { plannedAt: value }),
      '任务已排期',
      '任务排期失败，请稍后重试'
    );
  }

  function invalidatePublishRequest() {
    publishRequestId += 1;
    publishSubmitting.value = false;
  }

  function handlePublish(task: DistributionTask) {
    if (disposed) return;
    if (publishSubmitting.value && publishTaskId.value === task.taskId) return;
    if (publishSubmitting.value) invalidatePublishRequest();
    actionError.value = null;
    publishTaskId.value = task.taskId;
    publishTaskVersion.value = task.updatedAt;
    publishDialogVisible.value = true;
  }

  async function confirmPublish(data: TaskPublishPayload) {
    const taskId = publishTaskId.value;
    const version = publishTaskVersion.value;
    if (disposed || !taskId || !version || publishSubmitting.value) return;
    const requestId = ++publishRequestId;
    const payload = { ...data };
    actionError.value = null;
    publishSubmitting.value = true;
    try {
      await api.publishTask(taskId, payload, version);
      if (disposed || requestId !== publishRequestId || publishTaskId.value !== taskId) return;
      ElMessage.success('任务发布成功');
      await refresh();
      if (disposed || requestId !== publishRequestId || publishTaskId.value !== taskId) return;
      publishTaskId.value = null;
      publishTaskVersion.value = null;
      publishDialogVisible.value = false;
    } catch (error) {
      if (!disposed && requestId === publishRequestId && publishTaskId.value === taskId) {
        actionError.value = extractErrorMessage(error, '任务发布失败，请稍后重试');
      }
    } finally {
      if (!disposed && requestId === publishRequestId) publishSubmitting.value = false;
    }
  }

  function onPublishClosed() {
    if (publishSubmitting.value) invalidatePublishRequest();
    publishTaskId.value = null;
    publishTaskVersion.value = null;
  }

  async function handleComplete(task: DistributionTask) {
    await runPromptAction(
      task,
      'complete',
      () =>
        ElMessageBox.confirm(
          `确认将任务「${task.title || task.taskId}」标记为已完成？归因窗口将关闭。`,
          '标记完成',
          { type: 'warning', confirmButtonText: '确认完成', cancelButtonText: '返回' }
        ),
      () => api.completeTask(task.taskId),
      '任务已完成',
      '任务完成失败，请稍后重试'
    );
  }

  function invalidateFailRequest() {
    failRequestId += 1;
    failSubmitting.value = false;
  }

  function handleFail(task: DistributionTask) {
    if (disposed) return;
    if (failSubmitting.value && failTaskId.value === task.taskId) return;
    if (failSubmitting.value) invalidateFailRequest();
    actionError.value = null;
    failTaskId.value = task.taskId;
    failDialogVisible.value = true;
  }

  async function confirmFail(data: TaskFailPayload) {
    const taskId = failTaskId.value;
    if (disposed || !taskId || failSubmitting.value) return;
    const requestId = ++failRequestId;
    const payload = { ...data };
    actionError.value = null;
    failSubmitting.value = true;
    try {
      await api.failTask(taskId, payload);
      if (disposed || requestId !== failRequestId || failTaskId.value !== taskId) return;
      ElMessage.success('任务已标记为失败');
      await refresh();
      if (disposed || requestId !== failRequestId || failTaskId.value !== taskId) return;
      failTaskId.value = null;
      failDialogVisible.value = false;
    } catch (error) {
      if (!disposed && requestId === failRequestId && failTaskId.value === taskId) {
        actionError.value = extractErrorMessage(error, '任务标记失败，请稍后重试');
      }
    } finally {
      if (!disposed && requestId === failRequestId) failSubmitting.value = false;
    }
  }

  function onFailClosed() {
    if (failSubmitting.value) invalidateFailRequest();
    failTaskId.value = null;
  }

  async function handleCancel(task: DistributionTask) {
    await runPromptAction(
      task,
      'cancel',
      () =>
        ElMessageBox.prompt(
          `确认取消任务「${task.title || task.taskId}」？请输入取消原因。`,
          '取消任务',
          {
            confirmButtonText: '确认取消',
            cancelButtonText: '返回',
            inputPlaceholder: '取消原因',
            type: 'warning',
            inputValidator: (value) => (!!value && value.trim().length > 0) || '请填写取消原因'
          }
        ),
      (value) => api.cancelTask(task.taskId, { reason: value }),
      '任务已取消',
      '任务取消失败，请稍后重试'
    );
  }

  async function handleReassign(task: DistributionTask) {
    await runPromptAction(
      task,
      'reassign',
      () =>
        ElMessageBox.prompt(`为任务「${task.title || task.taskId}」指定新执行人 ID`, '转派任务', {
          confirmButtonText: '确认转派',
          cancelButtonText: '返回',
          inputPlaceholder: '执行人 ID',
          inputValue: task.assigneeId || '',
          inputValidator: (value) => (!!value && value.trim().length > 0) || '请填写执行人 ID'
        }),
      (value) => api.reassignTask(task.taskId, { assigneeId: value }),
      '任务已转派',
      '任务转派失败，请稍后重试'
    );
  }

  return {
    actionError,
    publishDialogVisible,
    publishSubmitting,
    failDialogVisible,
    failSubmitting,
    handleSchedule,
    handlePublish,
    confirmPublish,
    onPublishClosed,
    handleComplete,
    handleFail,
    confirmFail,
    onFailClosed,
    handleCancel,
    handleReassign
  };
}
