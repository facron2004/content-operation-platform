<template>
  <el-card v-loading="loading" class="task-summary">
    <template #header>
      <!-- Residual #256: prefer API dateFrom/dateTo over hard-coded 90d label. -->
      <span class="summary-title">活动任务表现（{{ windowLabel }}）</span>
    </template>
    <el-row v-if="performance" :gutter="16">
      <el-col v-for="metric in metrics" :key="metric.label" :xs="12" :sm="8" :md="4">
        <el-statistic :title="metric.label" :value="metric.value" :value-style="metric.style" />
      </el-col>
    </el-row>
    <el-empty v-else-if="!loading" description="暂无活动表现数据" :image-size="60" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { CampaignPerformanceResponse } from '@content/shared';
import { formatGmv } from '../../../utils/format';

interface SummaryMetric {
  label: string;
  value: number | string;
  style?: CSSProperties;
}

const props = withDefaults(
  defineProps<{
    // Residual #178: campaign-scoped performance (was platform task-status KPIs).
    performance: CampaignPerformanceResponse | null;
    loading?: boolean;
  }>(),
  { loading: false }
);

// Residual #256: INTERACTIVE_LIST_MAX_DAYS window bounds from API.
const windowLabel = computed(() => {
  const from = props.performance?.dateFrom;
  const to = props.performance?.dateTo;
  if (from && to) return `${from} ~ ${to}`;
  return '近 90 天';
});

const metrics = computed<SummaryMetric[]>(() => {
  const p = props.performance;
  return [
    { label: '任务总数', value: p?.totalTasks ?? 0 },
    { label: '已完成', value: p?.completedTasks ?? 0 },
    {
      label: '已失败',
      value: p?.failedTasks ?? 0,
      style: p && p.failedTasks > 0 ? { color: 'var(--el-color-danger)' } : undefined
    },
    { label: '订单数', value: p?.totalOrders ?? 0 },
    { label: '累计 GMV', value: formatGmv(p?.totalGmv ?? 0) }
  ];
});
</script>

<style scoped>
.task-summary {
  margin-bottom: 20px;
}

.summary-title {
  font-weight: 600;
}
</style>
