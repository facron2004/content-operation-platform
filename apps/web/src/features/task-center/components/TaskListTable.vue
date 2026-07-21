<template>
  <div class="task-list-table">
    <el-table v-loading="loading" :data="tasks" stripe style="width: 100%">
      <el-table-column label="任务ID" width="150" fixed="left">
        <template #default="{ row }">
          <div class="task-id-cell">
            <el-tooltip :content="row.taskId" placement="top" :show-after="200">
              <el-button type="primary" link class="task-id-link" @click="emit('view', row)">
                {{ shortId(row.taskId) }}
              </el-button>
            </el-tooltip>
            <el-button
              text
              size="small"
              :icon="CopyDocument"
              class="copy-btn"
              title="复制任务 ID"
              @click="copyTaskId(row.taskId)"
            />
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
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <div class="action-cell">
            <el-button type="primary" link size="small" @click="emit('view', row)">查看</el-button>
            <el-button
              v-if="canEdit(row)"
              type="primary"
              link
              size="small"
              @click="emit('edit', row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canPublish(row)"
              type="success"
              link
              size="small"
              @click="emit('publish', row)"
            >
              发布
            </el-button>
            <el-button
              v-if="canFail(row)"
              type="danger"
              link
              size="small"
              @click="emit('fail', row)"
            >
              失败
            </el-button>
            <el-button
              v-if="canCancel(row)"
              type="warning"
              link
              size="small"
              @click="emit('cancel', row)"
            >
              取消
            </el-button>
            <el-button
              v-if="canDelete(row)"
              type="danger"
              link
              size="small"
              @click="emit('delete', row)"
            >
              删除
            </el-button>
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
import { ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';
import type { DistributionTask, TaskChannel, TaskPriority, TaskStatus } from '@content/shared';
import TaskStatusTag from './TaskStatusTag.vue';

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
  publish: [row: DistributionTask];
  fail: [row: DistributionTask];
  cancel: [row: DistributionTask];
  'update:page': [value: number];
  'update:pageSize': [value: number];
}>();

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

const PUBLISHABLE: TaskStatus[] = ['draft', 'waiting_audit', 'scheduled'];
const FAILABLE: TaskStatus[] = ['published', 'overdue'];
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

function channelLabel(channel: string) {
  return channelLabels[channel as TaskChannel] || channel;
}

function priorityLabel(priority: string) {
  return priorityLabels[priority as TaskPriority] || priority;
}

function priorityType(priority: string) {
  return priorityTypes[priority as TaskPriority] || 'info';
}

function canPublish(task: DistributionTask) {
  return PUBLISHABLE.includes(task.status);
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

function canDelete(task: DistributionTask) {
  return DELETABLE.includes(task.status);
}

function shortId(id: string) {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

async function copyTaskId(id: string) {
  try {
    await navigator.clipboard.writeText(id);
    ElMessage.success('任务 ID 已复制');
  } catch {
    ElMessage.warning('复制失败,请手动复制');
  }
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
  display: flex;
  align-items: center;
  gap: 2px;
}

.task-id-link {
  font-family: monospace;
  font-size: 13px;
}

.copy-btn {
  padding: 2px;
  min-height: auto;
  color: var(--el-color-primary);
}

.action-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.action-cell .el-button + .el-button {
  margin-left: 0;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
