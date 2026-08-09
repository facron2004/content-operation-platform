<template>
  <div class="task-list-table">
    <ErrorAlert :message="copyError" />
    <el-table v-loading="loading" :data="tasks" stripe style="width: 100%">
      <el-table-column label="任务ID" width="150" fixed="left">
        <template #default="{ row }">
          <div class="task-id-cell">
            <el-tooltip :content="row.taskId" placement="top" :show-after="200">
              <AppleButton variant="ghost" class="task-id-link" @click="emit('view', row)">
                {{ shortId(row.taskId) }}
              </AppleButton>
            </el-tooltip>
            <AppleButton
              variant="quiet"
              size="sm"
              icon-only
              class="copy-btn"
              title="复制任务 ID"
              @click="copyTaskId(row.taskId)"
            >
              <template #icon>
                <el-icon><CopyDocument /></el-icon>
              </template>
            </AppleButton>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.title || row.packageName || '—' }}</template>
      </el-table-column>
      <el-table-column label="渠道" width="110">
        <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
      </el-table-column>
      <el-table-column label="优先级" width="100">
        <template #default="{ row }">
          <el-tag :type="priorityType(row.priority)" size="small" disable-transitions>
            {{ priorityLabel(row.priority) }}
          </el-tag>
        </template>
      </el-table-column>
      <!-- Residual #259: API list SELECT already projects riskLevel; form/detail write it. -->
      <el-table-column label="风险" width="80">
        <template #default="{ row }">
          <el-tag
            v-if="row.riskLevel"
            :type="riskType(row.riskLevel)"
            size="small"
            effect="plain"
            disable-transitions
          >
            {{ riskLabel(row.riskLevel) }}
          </el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <TaskStatusTag :status="row.status" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="排期时间" width="160">
        <template #default="{ row }">{{ formatDateTime(row.plannedAt) }}</template>
      </el-table-column>
      <el-table-column label="执行人" width="110">
        <template #default="{ row }">{{ row.assigneeName || '—' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="280" width="300" fixed="right">
        <template #default="{ row }">
          <div class="action-cell">
            <AppleButton variant="ghost" size="sm" @click="emit('view', row)">查看</AppleButton>
            <AppleButton v-if="canEdit(row)" variant="ghost" size="sm" @click="emit('edit', row)">
              编辑
            </AppleButton>
            <!-- Residual #180: schedule before publish; complete after publish. -->
            <AppleButton
              v-if="canSchedule(row)"
              variant="ghost"
              size="sm"
              @click="emit('schedule', row)"
            >
              排期
            </AppleButton>
            <AppleButton
              v-if="canPublish(row)"
              variant="ghost"
              size="sm"
              @click="emit('publish', row)"
            >
              发布
            </AppleButton>
            <AppleButton
              v-if="canComplete(row)"
              variant="ghost"
              size="sm"
              @click="emit('complete', row)"
            >
              完成
            </AppleButton>
            <AppleButton
              v-if="canFail(row)"
              variant="ghost"
              data-tone="danger"
              size="sm"
              @click="emit('fail', row)"
            >
              失败
            </AppleButton>
            <AppleButton
              v-if="canCancel(row)"
              variant="ghost"
              data-tone="warning"
              size="sm"
              @click="emit('cancel', row)"
            >
              取消
            </AppleButton>
            <!-- Residual #204: list reassign (detail already has handleReassignClick). -->
            <AppleButton
              v-if="canReassign(row)"
              variant="ghost"
              size="sm"
              @click="emit('reassign', row)"
            >
              转派
            </AppleButton>
            <AppleButton
              v-if="canDelete(row)"
              variant="ghost"
              data-tone="danger"
              size="sm"
              @click="emit('delete', row)"
            >
              删除
            </AppleButton>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无任务数据" :image-size="80" />
      </template>
    </el-table>
    <div v-if="pagination.total > 0" class="pagination-wrap">
      <el-pagination
        :current-page="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="(value: number) => emit('update:page', value)"
        @size-change="(value: number) => emit('update:pageSize', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue';
import type { DistributionTask, TaskChannel, TaskPriority, TaskStatus } from '@content/shared';
import TaskStatusTag from './TaskStatusTag.vue';
import AppleButton from '../../../components/AppleButton.vue';
import ErrorAlert from '../../../components/ErrorAlert.vue';
import { useTaskIdClipboard } from '../composables/useTaskIdClipboard';

withDefaults(
  defineProps<{
    tasks: DistributionTask[];
    loading?: boolean;
    pagination: { current: number; pageSize: number; total: number };
  }>(),
  { loading: false }
);

const emit = defineEmits<{
  view: [row: DistributionTask];
  edit: [row: DistributionTask];
  delete: [row: DistributionTask];
  schedule: [row: DistributionTask];
  publish: [row: DistributionTask];
  complete: [row: DistributionTask];
  fail: [row: DistributionTask];
  cancel: [row: DistributionTask];
  // Residual #204: list reassign → parent prompts assigneeId → api.reassignTask.
  reassign: [row: DistributionTask];
  'update:page': [value: number];
  'update:pageSize': [value: number];
}>();

const { copyError, copyTaskId } = useTaskIdClipboard();

const channelLabels: Record<TaskChannel, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

const priorityLabels: Record<TaskPriority, string> = {
  urgent: '紧急',
  normal: '普通',
  low: '低优先级'
};

const priorityTypes: Record<TaskPriority, 'danger' | 'primary' | 'info'> = {
  urgent: 'danger',
  normal: 'primary',
  low: 'info'
};

// Residual #259: same labels as TaskDetailPanel / TaskCreateDialog riskLevelOptions.
const riskLabels: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高'
};

const riskTypes: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger'
};

// Residual #176: gates must match API transitions (publish/fail only accept scheduled).
// Residual #180: schedule (draft/waiting_audit/blocked) + complete (published).
// draft/waiting_audit need schedule first; published/overdue cannot fail via this endpoint.
const SCHEDULABLE: TaskStatus[] = ['draft', 'waiting_audit', 'blocked'];
const PUBLISHABLE: TaskStatus[] = ['scheduled'];
const COMPLETABLE: TaskStatus[] = ['published'];
const FAILABLE: TaskStatus[] = ['scheduled'];
const CANCELLABLE: TaskStatus[] = [
  'draft',
  'waiting_audit',
  'scheduled',
  'published',
  'overdue',
  'blocked'
];
const EDITABLE: TaskStatus[] = ['draft', 'waiting_audit', 'scheduled'];
const DELETABLE: TaskStatus[] = ['draft', 'cancelled', 'failed'];
// Residual #204: API rejects completed/cancelled/failed; allow all other statuses.
const REASSIGNABLE: TaskStatus[] = [
  'draft',
  'waiting_audit',
  'scheduled',
  'published',
  'overdue',
  'blocked'
];

function channelLabel(channel: string) {
  return channelLabels[channel as TaskChannel] || channel;
}

function priorityLabel(priority: string) {
  return priorityLabels[priority as TaskPriority] || priority;
}

function priorityType(priority: string) {
  return priorityTypes[priority as TaskPriority] || 'info';
}

function riskLabel(level: string) {
  return riskLabels[level] || level;
}

function riskType(level: string): 'success' | 'warning' | 'danger' | 'info' {
  return riskTypes[level] || 'info';
}

function canSchedule(task: DistributionTask) {
  return SCHEDULABLE.includes(task.status);
}

function canPublish(task: DistributionTask) {
  return PUBLISHABLE.includes(task.status);
}

function canComplete(task: DistributionTask) {
  return COMPLETABLE.includes(task.status);
}

function canFail(task: DistributionTask) {
  return FAILABLE.includes(task.status);
}

function canCancel(task: DistributionTask) {
  return CANCELLABLE.includes(task.status);
}

function canEdit(task: DistributionTask) {
  return EDITABLE.includes(task.status);
}

function canReassign(task: DistributionTask) {
  return REASSIGNABLE.includes(task.status);
}

function canDelete(task: DistributionTask) {
  return DELETABLE.includes(task.status);
}

function shortId(id: string) {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
}
</script>

<style scoped>
.task-list-table {
  width: 100%;
}

.task-id-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}

.task-id-link {
  font-family: monospace;
  font-size: 13px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Color only — never collapse AppleButton height/padding (was causing 14px squash) */
.copy-btn {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
