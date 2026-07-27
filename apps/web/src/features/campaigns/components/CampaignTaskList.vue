<template>
  <el-card v-loading="loading" class="campaign-task-list" shadow="never">
    <template #header>
      <div class="list-header">
        <span class="list-title">
          近期任务（{{ tasksWindowLabel }}）
          <span v-if="tasksTotal > 0" class="list-count">（共 {{ tasksTotal }}）</span>
        </span>
        <div class="list-actions">
          <!-- Residual #198: deep-link create with campaign scope + create=1 auto-open. -->
          <AppleButton v-if="campaignId" variant="primary" size="sm" @click="goCreateTask">
            新建任务
          </AppleButton>
          <!-- Residual #212: deep-link batch create (batch=1) with campaign scope. -->
          <AppleButton v-if="campaignId" variant="secondary" size="sm" @click="goBatchCreateTask">
            批量建任务
          </AppleButton>
          <AppleButton variant="ghost" size="sm" @click="goTaskCenter">任务中心</AppleButton>
        </div>
      </div>
    </template>
    <el-table
      v-loading="tasksLoading"
      :data="tasks"
      size="small"
      stripe
      :empty-text="`${tasksWindowLabel}暂无活动任务`"
      style="width: 100%"
    >
      <el-table-column label="标题" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <AppleButton variant="ghost" size="sm" class="task-link" @click="goTask(row.taskId)">
            {{ row.title || row.packageName || shortId(row.taskId) }}
          </AppleButton>
        </template>
      </el-table-column>
      <el-table-column label="渠道" width="110">
        <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <TaskStatusTag :status="row.status" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="排期" width="160">
        <template #default="{ row }">{{ formatDateTime(row.plannedAt) }}</template>
      </el-table-column>
      <el-table-column label="执行人" width="110">
        <template #default="{ row }">{{ row.assigneeName || '—' }}</template>
      </el-table-column>
    </el-table>
    <!-- Residual #239: nested campaign tasks pagination (API listTasks page/pageSize ready). -->
    <div v-if="tasksTotal > tasksPageSize" class="tasks-pagination">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :total="tasksTotal"
        :page-size="tasksPageSize"
        :current-page="tasksPage"
        @current-change="(page: number) => emit('update:tasksPage', page)"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { DistributionTask } from '@content/shared';
import AppleButton from '../../../components/AppleButton.vue';
import TaskStatusTag from '../../task-center/components/TaskStatusTag.vue';

const props = withDefaults(
  defineProps<{
    // Residual #187/#239: paginated campaign-scoped tasks.
    tasks?: DistributionTask[];
    tasksTotal?: number;
    tasksPage?: number;
    tasksPageSize?: number;
    tasksLoading?: boolean;
    // Residual #271: INTERACTIVE_LIST_MAX_DAYS window honesty.
    tasksWindowLabel?: string;
    loading?: boolean;
    campaignId?: string;
  }>(),
  {
    tasks: () => [],
    tasksTotal: 0,
    tasksPage: 1,
    tasksPageSize: 10,
    tasksLoading: false,
    tasksWindowLabel: '近 90 天',
    loading: false,
    campaignId: ''
  }
);

const emit = defineEmits<{
  'update:tasksPage': [page: number];
}>();

const router = useRouter();

const CHANNEL_LABELS: Record<string, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

function channelLabel(channel?: string): string {
  if (!channel) return '—';
  return CHANNEL_LABELS[channel] || channel;
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function shortId(id?: string): string {
  if (!id) return '—';
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function goTask(taskId: string) {
  if (!taskId) return;
  router.push({ name: 'task-detail', params: { taskId } });
}

function goTaskCenter() {
  router.push({
    name: 'tasks',
    query: props.campaignId ? { campaignId: props.campaignId } : {}
  });
}

/** Residual #198: open task center create dialog pre-seeded with this campaign. */
function goCreateTask() {
  if (!props.campaignId) return;
  router.push({
    name: 'tasks',
    query: { campaignId: props.campaignId, create: '1' }
  });
}

/** Residual #212: open task center batch dialog pre-seeded with this campaign. */
function goBatchCreateTask() {
  if (!props.campaignId) return;
  router.push({
    name: 'tasks',
    query: { campaignId: props.campaignId, batch: '1' }
  });
}
</script>

<style scoped>
.campaign-task-list {
  margin-top: 16px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.list-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.list-title {
  font-weight: 600;
}

.list-count {
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.task-link {
  padding: 0;
  max-width: 100%;
}

.tasks-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
