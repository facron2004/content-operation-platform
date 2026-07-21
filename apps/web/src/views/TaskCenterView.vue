<template>
  <section class="page-stack task-center-page">
    <div class="page-header">
      <h2>任务中心</h2>
      <el-button type="primary" :icon="Plus" @click="openForm()">新建任务</el-button>
    </div>

    <TaskKpiRow :kpis="kpis" :loading="kpiLoading" />

    <TaskFilterBar v-model="filters" @search="handleSearch" />

    <TaskListTable
      v-loading="loading"
      :tasks="tasks"
      :pagination="pagination"
      @view="handleView"
      @edit="handleEdit"
      @delete="handleDelete"
      @publish="handlePublish"
      @fail="handleFail"
      @cancel="handleCancel"
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { useTaskCenter } from '../features/task-center/composables/useTaskCenter';
import { useTaskForm } from '../features/task-center/composables/useTaskForm';
import TaskKpiRow from '../features/task-center/components/TaskKpiRow.vue';
import TaskListTable from '../features/task-center/components/TaskListTable.vue';
import TaskFilterBar from '../features/task-center/components/TaskFilterBar.vue';
import TaskCreateDialog from '../features/task-center/components/TaskCreateDialog.vue';
import TaskPublishDialog from '../features/task-center/components/TaskPublishDialog.vue';
import TaskFailDialog from '../features/task-center/components/TaskFailDialog.vue';
import type { DistributionTask } from '@content/shared';

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
  handleDelete
} = useTaskCenter();

const {
  dialogVisible: formDialogVisible,
  submitting: formSubmitting,
  isEdit,
  form: taskForm,
  open: openForm,
  close: closeForm,
  submit: submitForm
} = useTaskForm();

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

function handleFail(task: DistributionTask) {
  selectedTaskId.value = task.taskId;
  failDialogVisible.value = true;
}

async function confirmFail(data: { failReason: string; failCategory?: string; note?: string }) {
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

function handleCancel(task: DistributionTask) {
  selectedTaskId.value = task.taskId;
}
</script>

<style scoped>
.task-center-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
</style>
