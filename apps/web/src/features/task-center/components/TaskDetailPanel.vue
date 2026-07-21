<template>
  <el-card v-loading="loading" class="task-detail-panel" shadow="never">
    <template #header>
      <div class="panel-header">
        <span class="panel-title">任务详情</span>
        <div v-if="task" class="panel-tags">
          <TaskStatusTag :status="task.status" />
          <el-tag :type="priorityType" size="small" disable-transitions>{{ priorityLabel }}</el-tag>
          <el-tag type="info" size="small" effect="plain" disable-transitions>
            {{ channelLabel }}
          </el-tag>
        </div>
      </div>
    </template>

    <template v-if="task">
      <el-descriptions :column="2" border class="detail-section" title="任务内容">
        <el-descriptions-item label="任务 ID" :span="2">
          <span class="mono">{{ task.taskId }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="标题" :span="2">{{ task.title || '—' }}</el-descriptions-item>
        <el-descriptions-item label="正文" :span="2">
          <div class="body-text">{{ task.body || '—' }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="CTA">{{ task.cta || '—' }}</el-descriptions-item>
        <el-descriptions-item label="追踪码">
          <span class="mono">{{ task.trackingCode || '—' }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-descriptions :column="2" border class="detail-section" title="时间安排">
        <el-descriptions-item label="排期时间">
          {{ formatDateTime(task.plannedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="发布时间">
          {{ formatDateTime(task.publishedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="完成时间">
          {{ formatDateTime(task.completedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDateTime(task.createdAt) }}
        </el-descriptions-item>
      </el-descriptions>

      <el-descriptions :column="2" border class="detail-section" title="归属信息">
        <el-descriptions-item label="执行人">{{ task.assigneeName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="套餐">
          {{ task.packageName || task.packageId }}
        </el-descriptions-item>
        <el-descriptions-item label="营销活动">
          {{ task.campaignName || task.campaignId || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="社群">
          {{ task.groupName || task.groupId || '—' }}
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="task.status === 'cancelled' && task.cancelReason"
        type="info"
        :title="`取消原因:${task.cancelReason}`"
        :closable="false"
        class="cancel-alert"
        show-icon
      />
    </template>
    <el-empty v-else-if="!loading" description="暂无任务数据" :image-size="80" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DistributionTask } from '@content/shared';
import TaskStatusTag from './TaskStatusTag.vue';

type TaskWithNames = DistributionTask & { campaignName?: string; groupName?: string };

const props = withDefaults(
  defineProps<{
    task: TaskWithNames | null;
    loading?: boolean;
  }>(),
  { loading: false }
);

const channelLabels: Record<string, string> = {
  wechat_group: '微信群',
  moments: '朋友圈',
  merchant_share: '商家转发'
};

const priorityLabels: Record<string, string> = {
  urgent: '紧急',
  normal: '普通',
  low: '低优先级'
};

const priorityTypes: Record<string, 'danger' | 'primary' | 'info'> = {
  urgent: 'danger',
  normal: 'primary',
  low: 'info'
};

const channelLabel = computed(
  () => channelLabels[props.task?.channel || ''] || props.task?.channel || '—'
);
const priorityLabel = computed(() => priorityLabels[props.task?.priority || ''] || '—');
const priorityType = computed(() => priorityTypes[props.task?.priority || ''] || 'info');

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
.task-detail-panel {
  margin-bottom: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
}

.panel-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-of-type {
  margin-bottom: 0;
}

.mono {
  font-family: monospace;
  font-size: 13px;
}

.body-text {
  white-space: pre-wrap;
  max-height: 140px;
  overflow-y: auto;
  line-height: 1.6;
}

.cancel-alert {
  margin-top: 16px;
}
</style>
