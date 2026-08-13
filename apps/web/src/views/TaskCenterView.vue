<template>
  <section class="page-stack task-center-page">
    <div class="page-header">
      <div class="task-heading">
        <h2>任务中心</h2>
        <p>创建时间范围：{{ windowLabel }}</p>
      </div>
      <div v-if="taskCapabilities.write" class="header-actions">
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
    <ErrorAlert :message="kpiError" />

    <TaskFilterBar v-model="filters" @search="handleSearch" />

    <!-- Residual #272: listTasks INTERACTIVE_LIST_MAX_DAYS window honesty. -->
    <p v-if="listDateFrom && listDateTo" class="list-window-hint">
      仅展示 {{ windowLabel }} 内创建的任务；更早记录不在本列表分页范围内。
    </p>
    <ErrorAlert :message="listError" />
    <ErrorAlert :message="actionError" />
    <ErrorAlert :message="writeError" />

    <TaskListTable
      v-loading="loading"
      :tasks="tasks"
      :pagination="pagination"
      :allow-write="taskCapabilities.write"
      :allow-manage="taskCapabilities.manage"
      :allow-publish="taskCapabilities.publish"
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
      @closed="onPublishClosed"
    />

    <TaskFailDialog
      v-model="failDialogVisible"
      :submitting="failSubmitting"
      @confirm="confirmFail"
      @closed="onFailClosed"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { useTaskCenter } from '../features/task-center/composables/useTaskCenter';
import { useTaskCenterActions } from '../features/task-center/composables/useTaskCenterActions';
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
import ErrorAlert from '../components/ErrorAlert.vue';
import type { DistributionTask } from '@content/shared';
import { useRoleStore } from '../stores/role';
import { resolveTaskCommandCapabilities } from '../features/task-center/task-command-permissions';

const route = useRoute();
const router = useRouter();
const roleStore = useRoleStore();
const taskCapabilities = computed(() =>
  resolveTaskCommandCapabilities(roleStore.effectiveRoles, roleStore.permissions)
);

const {
  loading,
  error: listError,
  tasks,
  pagination,
  kpis,
  kpiLoading,
  kpiError,
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

const writeError = ref<string | null>(null);

// Residual #190: refresh list + KPIs after create/edit so table is not stale.
const {
  dialogVisible: formDialogVisible,
  submitting: formSubmitting,
  isEdit,
  form: taskForm,
  open: openFormDialog,
  submit: submitForm
} = useTaskForm(undefined, {
  onSaved: refreshAfterSave,
  writeError
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
} = useTaskBatchCreate({ onSaved: refreshAfterSave, writeError });

const {
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
} = useTaskCenterActions({ refresh });

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
  if (batchFlag && taskCapabilities.value.write) openBatchForm();
  else if (createFlag && taskCapabilities.value.write) openForm();
  const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>;
  delete nextQuery.create;
  delete nextQuery.batch;
  router.replace({ name: 'tasks', query: nextQuery });
});

function handleSearch() {
  refresh();
}

function handleView(task: DistributionTask) {
  router.push(`/tasks/${task.taskId}`);
}

function handleEdit(task: DistributionTask) {
  openForm(task);
}
</script>

<style src="../styles/views/task-center.css" scoped></style>
