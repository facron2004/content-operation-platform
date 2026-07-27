import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { TaskChannel, TaskPriority } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import type { TaskCreateStatus } from './useTaskForm';

/** One editable batch row (group + package required per API CreateTaskDto). */
export interface TaskBatchRow {
  groupId: string;
  packageId: string;
  title: string;
}

export interface TaskBatchShared {
  campaignId: string;
  channel: TaskChannel;
  priority: TaskPriority;
  plannedAt: string;
  cta: string;
  // Residual #240: CreateTaskDto fields already accepted by batch API items.
  contentId: string;
  body: string;
  assigneeId: string;
  assigneeName: string;
  riskLevel: '' | 'low' | 'medium' | 'high';
  fallbackPackageId: string;
  // Residual #243: create-time status shared across batch items (#241 single-create parity).
  status: TaskCreateStatus;
}

const DEFAULT_SHARED: TaskBatchShared = {
  campaignId: '',
  channel: 'wechat_group',
  priority: 'normal',
  plannedAt: '',
  cta: '',
  contentId: '',
  body: '',
  assigneeId: '',
  assigneeName: '',
  riskLevel: '',
  fallbackPackageId: '',
  status: 'draft'
};

function emptyRow(): TaskBatchRow {
  return { groupId: '', packageId: '', title: '' };
}

/** Residual #212: SPA wire-up of existing POST /tasks/batch (max 100 server-side). */
export const TASK_BATCH_MAX_ROWS = 20;

export interface TaskBatchCreateOptions {
  onSaved?: () => void | Promise<void>;
}

export function useTaskBatchCreate(options: TaskBatchCreateOptions = {}) {
  const dialogVisible = ref(false);
  const submitting = ref(false);
  const shared = reactive<TaskBatchShared>({ ...DEFAULT_SHARED });
  const rows = ref<TaskBatchRow[]>([emptyRow(), emptyRow()]);

  function reset() {
    Object.assign(shared, DEFAULT_SHARED);
    rows.value = [emptyRow(), emptyRow()];
  }

  /**
   * Open batch dialog. Optional seed (campaignId / channel / priority / groupId for first row).
   */
  function open(seed?: Partial<TaskBatchShared> & { groupId?: string; packageId?: string }) {
    reset();
    if (seed?.campaignId) shared.campaignId = seed.campaignId;
    if (seed?.channel) shared.channel = seed.channel;
    if (seed?.priority) shared.priority = seed.priority;
    if (seed?.plannedAt) shared.plannedAt = seed.plannedAt;
    if (seed?.cta) shared.cta = seed.cta;
    if (seed?.contentId) shared.contentId = seed.contentId;
    if (seed?.body) shared.body = seed.body;
    if (seed?.assigneeId) shared.assigneeId = seed.assigneeId;
    if (seed?.assigneeName) shared.assigneeName = seed.assigneeName;
    if (seed?.riskLevel) shared.riskLevel = seed.riskLevel;
    if (seed?.fallbackPackageId) shared.fallbackPackageId = seed.fallbackPackageId;
    if (seed?.status) shared.status = seed.status;
    if (seed?.groupId) rows.value[0].groupId = seed.groupId;
    if (seed?.packageId) rows.value[0].packageId = seed.packageId;
    dialogVisible.value = true;
  }

  function close() {
    dialogVisible.value = false;
  }

  function addRow() {
    if (rows.value.length >= TASK_BATCH_MAX_ROWS) {
      ElMessage.warning(`单次最多 ${TASK_BATCH_MAX_ROWS} 行`);
      return;
    }
    rows.value.push(emptyRow());
  }

  function removeRow(index: number) {
    if (rows.value.length <= 1) {
      rows.value[0] = emptyRow();
      return;
    }
    rows.value.splice(index, 1);
  }

  function validate(): string | null {
    const filled = rows.value.filter((r) => r.groupId.trim() || r.packageId.trim());
    if (!filled.length) return '请至少填写一行群组 ID 与套餐 ID';
    for (let i = 0; i < rows.value.length; i++) {
      const r = rows.value[i];
      const g = r.groupId.trim();
      const p = r.packageId.trim();
      if (!g && !p) continue;
      if (!g || !p) return `第 ${i + 1} 行：群组 ID 与套餐 ID 均必填`;
    }
    return null;
  }

  /** Residual #243: mirror API assertCreateStatusRules / #241 single-create rules. */
  function validateCreateStatus(): string | null {
    if (shared.status === 'scheduled') {
      if (!shared.plannedAt) return '初始状态为「已排期」时必须填写排期时间';
      if (!shared.contentId.trim() && !shared.body.trim()) {
        return '初始状态为「已排期」时必须提供文案 ID 或正文';
      }
    }
    if (shared.status === 'waiting_audit' && !shared.contentId.trim()) {
      return '初始状态为「待审核」时必须提供文案 ID';
    }
    return null;
  }

  async function submit(): Promise<boolean> {
    const err = validate() ?? validateCreateStatus();
    if (err) {
      ElMessage.warning(err);
      return false;
    }
    // Residual #240: forward CreateTaskDto optional fields (empty → undefined).
    // Residual #243: shared create-time status on every batch item.
    const sharedOptional = {
      contentId: shared.contentId.trim() || undefined,
      body: shared.body.trim() || undefined,
      cta: shared.cta.trim() || undefined,
      plannedAt: shared.plannedAt || undefined,
      assigneeId: shared.assigneeId.trim() || undefined,
      assigneeName: shared.assigneeName.trim() || undefined,
      riskLevel: shared.riskLevel || undefined,
      fallbackPackageId: shared.fallbackPackageId.trim() || undefined,
      status: shared.status || 'draft'
    };
    const tasks = rows.value
      .filter((r) => r.groupId.trim() && r.packageId.trim())
      .map((r) => ({
        groupId: r.groupId.trim(),
        packageId: r.packageId.trim(),
        channel: shared.channel,
        priority: shared.priority,
        title: r.title.trim() || undefined,
        ...sharedOptional
      }));
    if (!tasks.length) {
      ElMessage.warning('请至少填写一行完整任务');
      return false;
    }
    submitting.value = true;
    try {
      const res = await api.batchCreateTasks({
        campaignId: shared.campaignId.trim() || undefined,
        tasks
      });
      const created = Number(res?.created ?? tasks.length);
      ElMessage.success(`已批量创建 ${created} 条任务`);
      dialogVisible.value = false;
      await options.onSaved?.();
      return true;
    } catch (e) {
      ElMessage.error(extractErrorMessage(e, '批量创建任务失败'));
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return {
    dialogVisible,
    submitting,
    shared,
    rows,
    open,
    close,
    reset,
    addRow,
    removeRow,
    submit,
    maxRows: TASK_BATCH_MAX_ROWS
  };
}
