<template>
  <section class="page-stack task-detail-page">
    <div class="back-link">
      <AppleButton variant="ghost" @click="$router.push('/tasks')">
        <template #icon>
          <el-icon><ArrowLeft /></el-icon>
        </template>
        返回任务列表
      </AppleButton>
    </div>

    <el-row :gutter="20">
      <el-col :span="16">
        <TaskDetailPanel :task="task" :loading="loading" />
        <!-- Residual #182: task-scoped TPD performance (API existed; SPA never mounted). -->
        <TaskPerformanceSummary :performance="performance" :loading="loading" />
        <div style="margin-top: 20px">
          <h3>执行记录</h3>
          <!-- Residual #260: pass ASC LIMIT honesty flags from getById. -->
          <TaskExecutionTimeline
            :executions="executions"
            :loading="loading"
            :truncated="executionsTruncated"
            :limit="executionsLimit"
          />
        </div>
      </el-col>
      <el-col :span="8">
        <el-card v-loading="loading">
          <template #header>
            <span>操作</span>
          </template>
          <div class="action-buttons">
            <!-- Residual #180: schedule before publish; complete after publish. -->
            <AppleButton v-if="canSchedule" variant="primary" @click="handleScheduleClick">
              <template #icon>
                <el-icon><Calendar /></el-icon>
              </template>
              排期
            </AppleButton>
            <AppleButton v-if="canPublish" variant="primary" @click="publishDialogVisible = true">
              <template #icon>
                <el-icon><Upload /></el-icon>
              </template>
              发布
            </AppleButton>
            <AppleButton v-if="canComplete" variant="secondary" @click="handleCompleteClick">
              <template #icon>
                <el-icon><Select /></el-icon>
              </template>
              标记完成
            </AppleButton>
            <AppleButton v-if="canFail" variant="danger" @click="failDialogVisible = true">
              <template #icon>
                <el-icon><Close /></el-icon>
              </template>
              标记失败
            </AppleButton>
            <AppleButton v-if="canCancel" variant="warning" @click="handleCancelClick">
              <template #icon>
                <el-icon><Switch /></el-icon>
              </template>
              取消任务
            </AppleButton>
            <AppleButton v-if="canReassign" variant="secondary" @click="handleReassignClick">
              <template #icon>
                <el-icon><Refresh /></el-icon>
              </template>
              重新分配
            </AppleButton>
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
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import {
  ArrowLeft,
  Upload,
  Close,
  Switch,
  Refresh,
  Calendar,
  Select
} from '@element-plus/icons-vue';
import { useTaskDetail } from '../features/task-center/composables/useTaskDetail';
import TaskDetailPanel from '../features/task-center/components/TaskDetailPanel.vue';
import TaskPerformanceSummary from '../features/task-center/components/TaskPerformanceSummary.vue';
import TaskExecutionTimeline from '../features/task-center/components/TaskExecutionTimeline.vue';
import TaskPublishDialog from '../features/task-center/components/TaskPublishDialog.vue';
import TaskFailDialog from '../features/task-center/components/TaskFailDialog.vue';
import AppleButton from '../components/AppleButton.vue';

const route = useRoute();
const taskId = route.params.taskId as string;

// Mount load lives inside useTaskDetail; mutates route through composable (#127).
const {
  loading,
  task,
  executions,
  executionsTruncated,
  executionsLimit,
  performance,
  publish,
  fail,
  cancel,
  reassign,
  schedule,
  complete
} = useTaskDetail(taskId);

// Residual #176: match API — publish/fail only accept scheduled (draft needs schedule first).
// Residual #180: schedule + complete affordances so the lifecycle is not a dead-end.
const canSchedule = computed(() => {
  const s = task.value?.status;
  return s === 'draft' || s === 'waiting_audit' || s === 'blocked';
});
const canPublish = computed(() => task.value?.status === 'scheduled');
const canComplete = computed(() => task.value?.status === 'published');
const canFail = computed(() => task.value?.status === 'scheduled');
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
    // Residual #127: route through composable (body reuse + timeline-only refresh).
    await publish(data);
    publishDialogVisible.value = false;
  } finally {
    publishSubmitting.value = false;
  }
}

async function confirmFail(data: {
  failReason: string;
  failCategory?: string;
  evidenceUrl?: string;
  note?: string;
}) {
  failSubmitting.value = true;
  try {
    await fail(data);
    failDialogVisible.value = false;
  } finally {
    failSubmitting.value = false;
  }
}

async function handleScheduleClick() {
  try {
    // Residual #180: ScheduleTaskDto.plannedAt — ISO-ish datetime string.
    const { value } = await ElMessageBox.prompt(
      '请输入排期时间（如 2026-07-25T10:00:00）',
      '任务排期',
      {
        confirmButtonText: '确认排期',
        cancelButtonText: '返回',
        inputPlaceholder: 'YYYY-MM-DDTHH:mm:ss',
        inputValue: task.value?.plannedAt?.slice(0, 19) || '',
        inputValidator: (v) => {
          if (!v || !v.trim()) return '请填写排期时间';
          const d = new Date(v.trim());
          return (!Number.isNaN(d.getTime()) && v.trim().length >= 10) || '排期时间格式无效';
        }
      }
    );
    await schedule({ plannedAt: value.trim() });
  } catch {
    // User dismissed or error
  }
}

async function handleCompleteClick() {
  try {
    await ElMessageBox.confirm(
      `确认将任务「${task.value?.title || taskId}」标记为已完成？归因窗口将关闭。`,
      '标记完成',
      { type: 'warning', confirmButtonText: '确认完成', cancelButtonText: '返回' }
    );
    await complete();
  } catch {
    // User dismissed or error
  }
}

async function handleCancelClick() {
  try {
    // Residual #175: pass prompt value as CancelTaskDto.reason (was hardcoded default
    // and previously sent under a key the DTO whitelist stripped).
    const { value } = await ElMessageBox.prompt('请输入取消原因', '取消任务', {
      confirmButtonText: '确认取消',
      cancelButtonText: '返回',
      inputPlaceholder: '取消原因',
      inputValidator: (v) => (!!v && v.trim().length > 0) || '请填写取消原因'
    });
    await cancel({ reason: value.trim() });
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
      await reassign({ assigneeId: value });
    }
  } catch {
    // User cancelled
  }
}
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

.action-buttons .apple-btn {
  width: 100%;
}

h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}
</style>
