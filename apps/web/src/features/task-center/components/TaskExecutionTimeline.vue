<template>
  <div v-loading="loading" class="task-execution-timeline">
    <!-- Residual #260: ASC LIMIT honesty (SKU #250 parity) — newer rows may be missing. -->
    <p v-if="truncated" class="timeline-cap-hint">
      仅展示最早 {{ limit ?? 500 }} 条执行记录，后续记录已截断
    </p>
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
            <!-- Residual #255: failCategory written by fail dialog + returned by API; surface on timeline. -->
            <el-tag
              v-if="exec.failCategory"
              type="danger"
              size="small"
              effect="plain"
              disable-transitions
            >
              {{ failCategoryLabel(exec.failCategory) }}
            </el-tag>
            <span v-if="exec.operatorName" class="exec-operator">{{ exec.operatorName }}</span>
          </div>
          <p v-if="exec.failReason" class="exec-fail-reason">失败原因:{{ exec.failReason }}</p>
          <p v-if="exec.note" class="exec-note">{{ exec.note }}</p>
          <el-link
            v-if="safeEvidenceUrl(exec.evidenceUrl)"
            :href="safeEvidenceUrl(exec.evidenceUrl)"
            target="_blank"
            rel="noopener noreferrer"
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
import { safeHttpUrl } from '../../../utils/safe-url';

withDefaults(
  defineProps<{
    executions: DistributionExecution[];
    loading?: boolean;
    // Residual #260: API executionsTruncated / executionsLimit.
    truncated?: boolean;
    limit?: number | null;
  }>(),
  { loading: false, truncated: false, limit: null }
);

function safeEvidenceUrl(url?: string) {
  return safeHttpUrl(url);
}

// Residual #181: schedule/complete must label — API writes them after #180 SPA wire-up.
const actionLabels: Record<string, string> = {
  publish: '发布',
  reschedule: '重新安排',
  schedule: '排期',
  complete: '完成',
  cancel: '取消',
  confirm_fail: '确认失败'
};

const actionTypes: Record<string, 'success' | 'primary' | 'warning' | 'danger' | 'info'> = {
  publish: 'success',
  reschedule: 'primary',
  schedule: 'primary',
  complete: 'success',
  cancel: 'warning',
  confirm_fail: 'danger'
};

// Residual #255: same labels as TaskFailDialog categoryOptions.
const failCategoryLabels: Record<string, string> = {
  content_issue: '内容违规',
  package_offline: '套餐已下架',
  out_of_stock: '库存不足',
  channel_issue: '渠道/群不可用',
  account_restricted: '账号受限',
  schedule_issue: '排期问题',
  other: '其他'
};

function actionLabel(action: string) {
  return actionLabels[action] || action;
}

function actionType(action: string) {
  return actionTypes[action] || 'info';
}

function failCategoryLabel(category: string) {
  return failCategoryLabels[category] || category;
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

.timeline-cap-hint {
  margin: 0 0 8px;
  color: var(--el-color-warning);
  font-size: 12px;
  line-height: 1.5;
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
