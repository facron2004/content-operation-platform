import { computed, reactive, ref } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import type { DistributionTask, TaskChannel, TaskPriority } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

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
  assigneeId: ''
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
}

export function useTaskForm(existing?: DistributionTask) {
  const dialogVisible = ref(false);
  const submitting = ref(false);
  const editingTask = ref<DistributionTask | undefined>(existing);

  const form = reactive<TaskFormState>({ ...DEFAULT_FORM });
  fillForm(form, existing);

  const isEdit = computed(() => Boolean(editingTask.value));

  function open(task?: DistributionTask) {
    const target = task !== undefined ? task : existing;
    editingTask.value = target;
    fillForm(form, target);
    dialogVisible.value = true;
  }

  function close() {
    dialogVisible.value = false;
  }

  function reset() {
    editingTask.value = undefined;
    fillForm(form, undefined);
  }

  async function submit(): Promise<boolean> {
    if (!form.groupId.trim() || !form.packageId.trim()) {
      ElMessage.warning('请填写必填字段:群组 ID 和套餐 ID');
      return false;
    }
    submitting.value = true;
    try {
      if (editingTask.value) {
        await api.updateTask(editingTask.value.taskId, {
          title: form.title.trim() || undefined,
          body: form.body.trim() || undefined,
          cta: form.cta.trim() || undefined,
          priority: form.priority,
          plannedAt: form.plannedAt || undefined,
          assigneeId: form.assigneeId.trim() || undefined
        });
        ElMessage.success('任务已更新');
      } else {
        await api.createTask({
          campaignId: form.campaignId.trim() || undefined,
          groupId: form.groupId.trim(),
          packageId: form.packageId.trim(),
          channel: form.channel,
          title: form.title.trim() || undefined,
          body: form.body.trim() || undefined,
          cta: form.cta.trim() || undefined,
          priority: form.priority,
          plannedAt: form.plannedAt || undefined,
          assigneeId: form.assigneeId.trim() || undefined
        });
        ElMessage.success('任务已创建');
      }
      dialogVisible.value = false;
      exported.onSaved?.();
      return true;
    } catch (err) {
      ElMessage.error(
        extractErrorMessage(err, editingTask.value ? '更新任务失败' : '创建任务失败')
      );
      return false;
    } finally {
      submitting.value = false;
    }
  }

  const exported = {
    dialogVisible,
    submitting,
    isEdit,
    editingTask,
    form,
    rules: taskFormRules,
    open,
    close,
    reset,
    submit,
    onSaved: undefined as (() => void) | undefined
  };

  return exported;
}
