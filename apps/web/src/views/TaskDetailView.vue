<template>
  <section class="page-stack task-detail-page">
    <div class="back-link">
      <el-button text :icon="ArrowLeft" @click="$router.push('/tasks')">返回任务列表</el-button>
    </div>

    <el-row :gutter="20">
      <el-col :span="16">
        <TaskDetailPanel :task="task" :loading="loading" />
        <div style="margin-top: 20px">
          <h3>执行记录</h3>
          <TaskExecutionTimeline :executions="executions" :loading="loading" />
        </div>
      </el-col>
      <el-col :span="8">
        <el-card v-loading="loading">
          <template #header>
            <span>操作</span>
          </template>
          <div class="action-buttons">
            <el-button
              v-if="canPublish"
              type="primary"
              :icon="Upload"
              @click="publishDialogVisible = true"
            >
              发布
            </el-button>
            <el-button v-if="canFail" type="danger" :icon="Close" @click="failDialogVisible = true">
              标记失败
            </el-button>
            <el-button v-if="canCancel" type="warning" :icon="Switch" @click="handleCancelClick">
              取消任务
            </el-button>
            <el-button v-if="canReassign" :icon="Refresh" @click="handleReassignClick">
              重新分配
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

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
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Upload, Close, Switch, Refresh } from '@element-plus/icons-vue';
import { api } from '../services/api';
import { useTaskDetail } from '../features/task-center/composables/useTaskDetail';
import TaskDetailPanel from '../features/task-center/components/TaskDetailPanel.vue';
import TaskExecutionTimeline from '../features/task-center/components/TaskExecutionTimeline.vue';
import TaskPublishDialog from '../features/task-center/components/TaskPublishDialog.vue';
import TaskFailDialog from '../features/task-center/components/TaskFailDialog.vue';

const route = useRoute();
const taskId = route.params.taskId as string;

const { loading, task, executions, loadDetail } = useTaskDetail(taskId);

const canPublish = computed(
  () =>
    task.value?.status === 'draft' ||
    task.value?.status === 'waiting_audit' ||
    task.value?.status === 'scheduled'
);
const canFail = computed(
  () => task.value?.status === 'published' || task.value?.status === 'scheduled'
);
const canCancel = computed(
  () =>
    task.value?.status !== 'completed' &&
    task.value?.status !== 'cancelled' &&
    task.value?.status !== 'failed'
);
const canReassign = computed(
  () =>
    task.value?.status !== 'completed' &&
    task.value?.status !== 'cancelled' &&
    task.value?.status !== 'failed'
);

const publishDialogVisible = ref(false);
const publishSubmitting = ref(false);

const failDialogVisible = ref(false);
const failSubmitting = ref(false);

async function confirmPublish(data: { evidenceUrl?: string; note?: string }) {
  publishSubmitting.value = true;
  try {
    await api.publishTask(taskId, data);
    ElMessage.success('任务发布成功');
    publishDialogVisible.value = false;
    loadDetail();
  } finally {
    publishSubmitting.value = false;
  }
}

async function confirmFail(data: { failReason: string; failCategory?: string; note?: string }) {
  failSubmitting.value = true;
  try {
    await api.failTask(taskId, data);
    ElMessage.success('任务已标记为失败');
    failDialogVisible.value = false;
    loadDetail();
  } finally {
    failSubmitting.value = false;
  }
}

async function handleCancelClick() {
  try {
    await ElMessageBox.prompt('请输入取消原因', '取消任务', {
      confirmButtonText: '确认取消',
      cancelButtonText: '返回',
      inputPlaceholder: '取消原因'
    });
    await api.cancelTask(taskId, { cancelReason: '手动取消' });
    ElMessage.success('任务已取消');
    loadDetail();
  } catch {
    // User cancelled or error
  }
}

async function handleReassignClick() {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的执行人ID', '重新分配任务', {
      confirmButtonText: '确认分配',
      cancelButtonText: '返回',
      inputPlaceholder: '执行人ID'
    });
    if (value) {
      await api.reassignTask(taskId, { assigneeId: value });
      ElMessage.success('任务已重新分配');
      loadDetail();
    }
  } catch {
    // User cancelled
  }
}

onMounted(loadDetail);
</script>

<style scoped>
.task-detail-page {
  padding: 20px;
}

.back-link {
  margin-bottom: 16px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-buttons .el-button {
  width: 100%;
}

h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}
</style>
