<template>
  <div v-loading="loading" class="task-execution-timeline">
    <el-timeline v-if="executions.length > 0">
      <el-timeline-item
        v-for="exec in executions"
        :key="exec.executionId"
        :timestamp="formatDateTime(exec.createdAt)"
        :type="actionType(exec.action)"
        placement="top"
      >
        <div class="exec-item">
          <div class="exec-header">
            <el-tag :type="actionType(exec.action)" size="small" disable-transitions>
              {{ actionLabel(exec.action) }}
            </el-tag>
            <span v-if="exec.operatorName" class="exec-operator">{{ exec.operatorName }}</span>
          </div>
          <p v-if="exec.failReason" class="exec-fail-reason">失败原因:{{ exec.failReason }}</p>
          <p v-if="exec.note" class="exec-note">{{ exec.note }}</p>
          <el-link
            v-if="exec.evidenceUrl"
            :href="exec.evidenceUrl"
            target="_blank"
            type="primary"
            class="exec-link"
          >
            查看凭证
          </el-link>
        </div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else-if="!loading" description="暂无执行记录" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import type { DistributionExecution } from '@content/shared';

withDefaults(
  defineProps<{
    executions: DistributionExecution[];
    loading?: boolean;
  }>(),
  { loading: false }
);

const actionLabels: Record<string, string> = {
  publish: '发布',
  reschedule: '重新安排',
  cancel: '取消',
  confirm_fail: '确认失败'
};

const actionTypes: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
  publish: 'success',
  reschedule: 'primary',
  cancel: 'warning',
  confirm_fail: 'danger'
};

function actionLabel(action: string) {
  return actionLabels[action] || action;
}

function actionType(action: string) {
  return actionTypes[action] || 'info';
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
.task-execution-timeline {
  min-height: 120px;
  padding-top: 8px;
}

.exec-item {
  padding: 4px 0;
}

.exec-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exec-operator {
  color: var(--el-text-color-secondary, #909399);
  font-size: 13px;
}

.exec-note {
  margin: 6px 0 0;
  color: var(--el-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.5;
}

.exec-fail-reason {
  margin: 6px 0 0;
  color: var(--el-color-danger, #f56c6c);
  font-size: 13px;
  line-height: 1.5;
}

.exec-link {
  margin-top: 6px;
  font-size: 13px;
}
</style>
