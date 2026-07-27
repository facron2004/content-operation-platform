<template>
  <section class="page-stack task-center-page">
    <div class="page-header">
      <h2>任务中心（{{ windowLabel }}）</h2>
      <div class="header-actions">
        <!-- Residual #212: batch create (POST /tasks/batch client existed unused). -->
        <AppleButton variant="secondary" @click="openBatchForm()">批量创建</AppleButton>
        <AppleButton variant="primary" @click="openForm()">
          <template #icon>
            <el-icon><Plus /></el-icon>
          </template>
          新建任务
        </AppleButton>
      </div>
    </div>

    <!-- Residual #206: KPI tiles click-to-filter the list. -->
    <TaskKpiRow :kpis="kpis" :loading="kpiLoading" @filter="applyKpiFilter" />

    <TaskFilterBar v-model="filters" @search="handleSearch" />

    <!-- Residual #272: listTasks INTERACTIVE_LIST_MAX_DAYS window honesty. -->
    <p v-if="listDateFrom && listDateTo" class="list-window-hint">
      仅展示 {{ windowLabel }} 内创建的任务；更早记录不在本列表分页范围内。
    </p>

    <TaskListTable
      v-loading="loading"
      :tasks="tasks"
      :pagination="pagination"
      @view="handleView"
      @edit="handleEdit"
      @delete="handleDelete"
      @schedule="handleSchedule"
      @publish="handlePublish"
      @complete="handleComplete"
      @fail="handleFail"
      @cancel="handleCancel"
      @reassign="handleReassign"
      @update:page="setPage"
      @update:page-size="setPageSize"
    />

    <TaskCreateDialog
      v-model="formDialogVisible"
      :submitting="formSubmitting"
      :is-edit="isEdit"
      :form="taskForm"
      @submit="submitForm"
    />

    <!-- Residual #212: multi-row batch create dialog. -->
    <TaskBatchCreateDialog
      v-model="batchDialogVisible"
      :submitting="batchSubmitting"
      :shared="batchShared"
      :rows="batchRows"
      :max-rows="batchMaxRows"
      @submit="submitBatch"
      @add-row="addBatchRow"
      @remove-row="removeBatchRow"
    />

    <TaskPublishDialog
      v-model="publishDialogVisible"
      :submitting="publishSubmitting"
      @confirm="confirmPublish"
    />

    <TaskFailDialog
      v-model="failDialogVisible"
      :submitting="failSubmitting"
      @confirm="confirmFail"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { useTaskCenter } from '../features/task-center/composables/useTaskCenter';
import { useTaskForm } from '../features/task-center/composables/useTaskForm';
import { useTaskBatchCreate } from '../features/task-center/composables/useTaskBatchCreate';
import TaskKpiRow from '../features/task-center/components/TaskKpiRow.vue';
import TaskListTable from '../features/task-center/components/TaskListTable.vue';
import TaskFilterBar from '../features/task-center/components/TaskFilterBar.vue';
import TaskCreateDialog from '../features/task-center/components/TaskCreateDialog.vue';
import TaskBatchCreateDialog from '../features/task-center/components/TaskBatchCreateDialog.vue';
import TaskPublishDialog from '../features/task-center/components/TaskPublishDialog.vue';
import TaskFailDialog from '../features/task-center/components/TaskFailDialog.vue';
import AppleButton from '../components/AppleButton.vue';
import type { DistributionTask } from '@content/shared';

const route = useRoute();
const router = useRouter();

const {
  loading,
  tasks,
  pagination,
  kpis,
  kpiLoading,
  filters,
  setPage,
  setPageSize,
  refresh,
  loadKPIs,
  handleDelete,
  applyKpiFilter,
  // Residual #272: listTasks INTERACTIVE window honesty.
  listDateFrom,
  listDateTo,
  windowLabel
} = useTaskCenter();

const refreshAfterSave = async () => {
  await refresh();
  await loadKPIs();
};

// Residual #190: refresh list + KPIs after create/edit so table is not stale.
const {
  dialogVisible: formDialogVisible,
  submitting: formSubmitting,
  isEdit,
  form: taskForm,
  open: openFormDialog,
  close: closeForm,
  submit: submitForm
} = useTaskForm(undefined, {
  onSaved: refreshAfterSave
});

// Residual #212: batch create via existing batchCreateTasks client.
const {
  dialogVisible: batchDialogVisible,
  submitting: batchSubmitting,
  shared: batchShared,
  rows: batchRows,
  maxRows: batchMaxRows,
  open: openBatchDialog,
  addRow: addBatchRow,
  removeRow: removeBatchRow,
  submit: submitBatch
} = useTaskBatchCreate({ onSaved: refreshAfterSave });

/**
 * Residual #194: seed create dialog from active list filters (route.query seeds
 * campaignId/groupId/packageId via #188/#247). Edit still passes the row.
 */
function openForm(task?: DistributionTask) {
  if (task) {
    openFormDialog(task);
    return;
  }
  // usePagedList exposes filters as a reactive object (not Ref) in script setup.
  const seed: Partial<typeof taskForm> = {};
  if (filters.campaignId) seed.campaignId = filters.campaignId;
  if (filters.groupId) seed.groupId = filters.groupId;
  // Residual #247: dedicated packageId filter (was keyword misuse).
  if (filters.packageId) seed.packageId = filters.packageId;
  if (filters.channel) {
    seed.channel = filters.channel as typeof taskForm.channel;
  }
  if (filters.priority) {
    seed.priority = filters.priority as typeof taskForm.priority;
  }
  openFormDialog(undefined, seed);
}

/** Residual #212: open batch dialog pre-seeded from list filters. */
function openBatchForm() {
  openBatchDialog({
    campaignId: filters.campaignId || undefined,
    groupId: filters.groupId || undefined,
    packageId: filters.packageId || undefined,
    channel: (filters.channel as typeof batchShared.channel) || undefined,
    priority: (filters.priority as typeof batchShared.priority) || undefined
  });
}

/**
 * Residual #198: nested campaign/community "新建任务" deep-links with create=1.
 * Residual #212: also support batch=1 for bulk create deep-link.
 * Filters already seeded from route.query (#188); open dialog then strip flags.
 */
onMounted(() => {
  const createFlag = String(route.query.create ?? '') === '1';
  const batchFlag = String(route.query.batch ?? '') === '1';
  if (!createFlag && !batchFlag) return;
  if (batchFlag) openBatchForm();
  else openForm();
  const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>;
  delete nextQuery.create;
  delete nextQuery.batch;
  router.replace({ name: 'tasks', query: nextQuery });
});

const publishDialogVisible = ref(false);
const publishSubmitting = ref(false);
const selectedTaskId = ref<string | null>(null);

const failDialogVisible = ref(false);
const failSubmitting = ref(false);

function handleSearch() {
  refresh();
}

function handleView(task: DistributionTask) {
  router.push(`/tasks/${task.taskId}`);
}

function handleEdit(task: DistributionTask) {
  openForm(task);
}

// Residual #180: list schedule/complete were missing — draft stuck after #176.
async function handleSchedule(task: DistributionTask) {
  try {
    const { value } = await ElMessageBox.prompt(
      `为任务「${task.title || task.taskId}」设置排期时间（如 2026-07-25T10:00:00）`,
      '任务排期',
      {
        confirmButtonText: '确认排期',
        cancelButtonText: '返回',
        inputPlaceholder: 'YYYY-MM-DDTHH:mm:ss',
        inputValue: task.plannedAt?.slice(0, 19) || '',
        inputValidator: (v) => {
          if (!v || !v.trim()) return '请填写排期时间';
          const d = new Date(v.trim());
          return (!Number.isNaN(d.getTime()) && v.trim().length >= 10) || '排期时间格式无效';
        }
      }
    );
    await api.scheduleTask(task.taskId, { plannedAt: value.trim() });
    ElMessage.success('任务已排期');
    refresh();
  } catch {
    // User dismissed prompt or interceptor handled API error.
  }
}

function handlePublish(task: DistributionTask) {
  selectedTaskId.value = task.taskId;
  publishDialogVisible.value = true;
}

async function confirmPublish(data: { evidenceUrl?: string; note?: string }) {
  if (!selectedTaskId.value) return;
  publishSubmitting.value = true;
  try {
    await api.publishTask(selectedTaskId.value, data);
    ElMessage.success('任务发布成功');
    publishDialogVisible.value = false;
    refresh();
  } catch {
    // Error handled by interceptor
  } finally {
    publishSubmitting.value = false;
  }
}

async function handleComplete(task: DistributionTask) {
  try {
    await ElMessageBox.confirm(
      `确认将任务「${task.title || task.taskId}」标记为已完成？归因窗口将关闭。`,
      '标记完成',
      { type: 'warning', confirmButtonText: '确认完成', cancelButtonText: '返回' }
    );
    await api.completeTask(task.taskId);
    ElMessage.success('任务已完成');
    refresh();
  } catch {
    // User dismissed or interceptor handled API error.
  }
}

function handleFail(task: DistributionTask) {
  selectedTaskId.value = task.taskId;
  failDialogVisible.value = true;
}

async function confirmFail(data: {
  failReason: string;
  failCategory?: string;
  evidenceUrl?: string;
  note?: string;
}) {
  if (!selectedTaskId.value) return;
  failSubmitting.value = true;
  try {
    await api.failTask(selectedTaskId.value, data);
    ElMessage.success('任务已标记为失败');
    failDialogVisible.value = false;
    refresh();
  } catch {
    // Error handled by interceptor
  } finally {
    failSubmitting.value = false;
  }
}

// Residual #175: list cancel was a pure no-op (only set selectedTaskId).
// Mirror detail cancel: prompt reason → api.cancelTask({ reason }) → refresh.
async function handleCancel(task: DistributionTask) {
  try {
    const { value } = await ElMessageBox.prompt(
      `确认取消任务「${task.title || task.taskId}」？请输入取消原因。`,
      '取消任务',
      {
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        inputPlaceholder: '取消原因',
        type: 'warning',
        inputValidator: (v) => (!!v && v.trim().length > 0) || '请填写取消原因'
      }
    );
    await api.cancelTask(task.taskId, { reason: value.trim() });
    ElMessage.success('任务已取消');
    refresh();
  } catch {
    // User dismissed prompt or interceptor handled API error.
  }
}

/**
 * Residual #204: list reassign — detail already prompts assigneeId; wire same
 * flow so operators need not open detail for triage reassignment.
 */
async function handleReassign(task: DistributionTask) {
  try {
    const { value } = await ElMessageBox.prompt(
      `为任务「${task.title || task.taskId}」指定新执行人 ID`,
      '转派任务',
      {
        confirmButtonText: '确认转派',
        cancelButtonText: '返回',
        inputPlaceholder: '执行人 ID',
        inputValue: task.assigneeId || '',
        inputValidator: (v) => (!!v && v.trim().length > 0) || '请填写执行人 ID'
      }
    );
    await api.reassignTask(task.taskId, { assigneeId: value.trim() });
    ElMessage.success('任务已转派');
    refresh();
  } catch {
    // User dismissed prompt or interceptor handled API error.
  }
}
</script>

<style src="../styles/views/task-center.css" scoped></style>
