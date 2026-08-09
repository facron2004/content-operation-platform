import { computed, onScopeDispose, reactive, ref, type Ref } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import type { DistributionTask, TaskChannel, TaskPriority } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { resolveSubmissionIntent, type SubmissionIntent } from '../../../services/idempotency-key';

/** Residual #241: CreateTaskDto create-time status only (not full TaskStatus). */
export type TaskCreateStatus = 'draft' | 'waiting_audit' | 'scheduled';

export interface TaskFormState {
  campaignId: string;
  groupId: string;
  packageId: string;
  channel: TaskChannel;
  title: string;
  body: string;
  cta: string;
  priority: TaskPriority;
  plannedAt: string;
  assigneeId: string;
  // Residual #233: Create/UpdateTaskDto already accepts these.
  contentId: string;
  assigneeName: string;
  riskLevel: '' | 'low' | 'medium' | 'high';
  fallbackPackageId: string;
  // Residual #241: create-time status (edit ignores; transitions use action endpoints).
  status: TaskCreateStatus;
}

const DEFAULT_FORM: TaskFormState = {
  campaignId: '',
  groupId: '',
  packageId: '',
  channel: 'wechat_group',
  title: '',
  body: '',
  cta: '',
  priority: 'normal',
  plannedAt: '',
  assigneeId: '',
  contentId: '',
  assigneeName: '',
  riskLevel: '',
  fallbackPackageId: '',
  status: 'draft'
};

export const taskFormRules: FormRules = {
  groupId: [{ required: true, message: '请输入群组 ID', trigger: 'blur' }],
  packageId: [{ required: true, message: '请输入套餐 ID', trigger: 'blur' }],
  channel: [{ required: true, message: '请选择投放渠道', trigger: 'change' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }]
};

function fillForm(form: TaskFormState, task?: DistributionTask) {
  form.campaignId = task?.campaignId ?? DEFAULT_FORM.campaignId;
  form.groupId = task?.groupId ?? DEFAULT_FORM.groupId;
  form.packageId = task?.packageId ?? DEFAULT_FORM.packageId;
  form.channel = task?.channel ?? DEFAULT_FORM.channel;
  form.title = task?.title ?? DEFAULT_FORM.title;
  form.body = task?.body ?? DEFAULT_FORM.body;
  form.cta = task?.cta ?? DEFAULT_FORM.cta;
  form.priority = task?.priority ?? DEFAULT_FORM.priority;
  form.plannedAt = task?.plannedAt ?? DEFAULT_FORM.plannedAt;
  form.assigneeId = task?.assigneeId ?? DEFAULT_FORM.assigneeId;
  form.contentId = task?.contentId ?? DEFAULT_FORM.contentId;
  form.assigneeName = task?.assigneeName ?? DEFAULT_FORM.assigneeName;
  form.riskLevel =
    task?.riskLevel === 'low' || task?.riskLevel === 'medium' || task?.riskLevel === 'high'
      ? task.riskLevel
      : DEFAULT_FORM.riskLevel;
  form.fallbackPackageId = task?.fallbackPackageId ?? DEFAULT_FORM.fallbackPackageId;
  // Create-time status only; edit always resets to draft (not used on update payload).
  form.status = DEFAULT_FORM.status;
}

/** Residual #194: apply partial create seeds (deep-link / filter bar scope). */
function applySeed(form: TaskFormState, seed?: Partial<TaskFormState>) {
  if (!seed) return;
  if (seed.campaignId !== undefined) form.campaignId = seed.campaignId;
  if (seed.groupId !== undefined) form.groupId = seed.groupId;
  if (seed.packageId !== undefined) form.packageId = seed.packageId;
  if (seed.channel !== undefined) form.channel = seed.channel;
  if (seed.title !== undefined) form.title = seed.title;
  if (seed.body !== undefined) form.body = seed.body;
  if (seed.cta !== undefined) form.cta = seed.cta;
  if (seed.priority !== undefined) form.priority = seed.priority;
  if (seed.plannedAt !== undefined) form.plannedAt = seed.plannedAt;
  if (seed.assigneeId !== undefined) form.assigneeId = seed.assigneeId;
  if (seed.contentId !== undefined) form.contentId = seed.contentId;
  if (seed.assigneeName !== undefined) form.assigneeName = seed.assigneeName;
  if (seed.riskLevel !== undefined) form.riskLevel = seed.riskLevel;
  if (seed.fallbackPackageId !== undefined) form.fallbackPackageId = seed.fallbackPackageId;
  if (seed.status !== undefined) form.status = seed.status;
}

export interface TaskFormOptions {
  // Residual #190: refresh list (+ KPIs) after create/edit success.
  onSaved?: () => void | Promise<void>;
  writeError?: Ref<string | null>;
}

export function useTaskForm(existing?: DistributionTask, options: TaskFormOptions = {}) {
  const dialogVisible = ref(false);
  const submitting = ref(false);
  const editingTask = ref<DistributionTask | undefined>(existing);
  const writeError = options.writeError ?? ref<string | null>(null);
  let submitSequence = 0;
  let disposed = false;
  let createIntent: SubmissionIntent | null = null;

  const form = reactive<TaskFormState>({ ...DEFAULT_FORM });
  fillForm(form, existing);

  const isEdit = computed(() => Boolean(editingTask.value));

  /**
   * Residual #194: open for edit when `task` is provided; otherwise create mode
   * with optional partial seed from list filters / deep-link query.
   */
  function open(task?: DistributionTask, seed?: Partial<TaskFormState>) {
    writeError.value = null;
    createIntent = null;
    if (task) {
      editingTask.value = task;
      fillForm(form, task);
    } else {
      editingTask.value = undefined;
      fillForm(form, undefined);
      applySeed(form, seed);
    }
    dialogVisible.value = true;
  }

  function close() {
    dialogVisible.value = false;
  }

  function reset() {
    editingTask.value = undefined;
    createIntent = null;
    fillForm(form, undefined);
  }

  /** Residual #241: mirror API assertCreateStatusRules before POST. */
  function validateCreateStatus(): string | null {
    if (form.status === 'scheduled') {
      if (!form.plannedAt) return '初始状态为「已排期」时必须填写排期时间';
      if (!form.contentId.trim() && !form.body.trim()) {
        return '初始状态为「已排期」时必须提供文案 ID 或正文';
      }
    }
    if (form.status === 'waiting_audit' && !form.contentId.trim()) {
      return '初始状态为「待审核」时必须提供文案 ID';
    }
    return null;
  }

  async function submit(): Promise<boolean> {
    if (disposed || submitting.value) return false;
    writeError.value = null;
    if (!form.groupId.trim() || !form.packageId.trim()) {
      ElMessage.warning('请填写必填字段:群组 ID 和套餐 ID');
      return false;
    }
    if (!editingTask.value) {
      const statusErr = validateCreateStatus();
      if (statusErr) {
        ElMessage.warning(statusErr);
        return false;
      }
    }
    const submitId = ++submitSequence;
    const editingTaskSnapshot = editingTask.value;
    submitting.value = true;
    try {
      // Residual #233: forward DTO-ready contentId/risk/fallback/assigneeName.
      // Residual #237: UpdateTaskDto also accepts identity fields the dialog shows
      // (campaignId/groupId/packageId/channel) — edit used to silently drop them.
      const identityFields = {
        campaignId: form.campaignId.trim() || undefined,
        groupId: form.groupId.trim(),
        packageId: form.packageId.trim(),
        channel: form.channel
      };
      const optionalFields = {
        contentId: form.contentId.trim() || undefined,
        title: form.title.trim() || undefined,
        body: form.body.trim() || undefined,
        cta: form.cta.trim() || undefined,
        priority: form.priority,
        plannedAt: form.plannedAt || undefined,
        assigneeId: form.assigneeId.trim() || undefined,
        assigneeName: form.assigneeName.trim() || undefined,
        riskLevel: form.riskLevel || undefined,
        fallbackPackageId: form.fallbackPackageId.trim() || undefined
      };
      if (editingTaskSnapshot) {
        await api.updateTask(editingTaskSnapshot.taskId, {
          ...identityFields,
          ...optionalFields
        });
      } else {
        // Residual #241: create-time status (draft default; waiting_audit/scheduled when valid).
        const payload = {
          ...identityFields,
          ...optionalFields,
          status: form.status || 'draft'
        };
        createIntent = resolveSubmissionIntent('create-task', payload, createIntent);
        await api.createTask(payload, createIntent.key);
      }
      if (disposed || submitId !== submitSequence) return false;
      ElMessage.success(editingTaskSnapshot ? '任务已更新' : '任务已创建');
      dialogVisible.value = false;
      // Residual #190: prefer options.onSaved; keep mutable slot for legacy assigners.
      await (options.onSaved ?? exported.onSaved)?.();
      if (!editingTaskSnapshot) createIntent = null;
      return !disposed && submitId === submitSequence;
    } catch (err) {
      if (!disposed && submitId === submitSequence) {
        writeError.value = extractErrorMessage(
          err,
          editingTaskSnapshot ? '更新任务失败' : '创建任务失败'
        );
        ElMessage.error(writeError.value);
      }
      return false;
    } finally {
      if (!disposed && submitId === submitSequence) submitting.value = false;
    }
  }

  onScopeDispose(() => {
    disposed = true;
    submitSequence += 1;
    submitting.value = false;
  });

  const exported = {
    dialogVisible,
    submitting,
    writeError,
    isEdit,
    editingTask,
    form,
    rules: taskFormRules,
    open,
    close,
    reset,
    submit,
    onSaved: options.onSaved as (() => void | Promise<void>) | undefined
  };

  return exported;
}
