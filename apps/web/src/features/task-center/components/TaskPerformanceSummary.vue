<template>
  <el-card v-loading="loading" class="task-performance-summary" shadow="never">
    <template #header>
      <!-- Residual #256: prefer API dateFrom/dateTo over hard-coded 90d label. -->
      <span class="summary-title">任务表现（{{ windowLabel }}）</span>
    </template>
    <el-row v-if="performance" :gutter="16">
      <el-col v-for="metric in metrics" :key="metric.label" :xs="12" :sm="8" :md="4">
        <el-statistic :title="metric.label" :value="metric.value" :value-style="metric.style" />
      </el-col>
    </el-row>
    <el-empty v-else-if="!loading" description="暂无任务表现数据" :image-size="60" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { TaskPerformanceResponse } from '@content/shared';
import { formatGmv, formatPercent } from '../../../utils/format';

interface SummaryMetric {
  label: string;
  value: number | string;
  style?: CSSProperties;
}

const props = withDefaults(
  defineProps<{
    // Residual #182: task-scoped TPD aggregate (not platform task-status KPIs).
    performance: TaskPerformanceResponse | null;
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
    { label: '访问量', value: p?.visits ?? 0 },
    { label: '订单数', value: p?.orders ?? 0 },
    { label: '累计 GMV', value: formatGmv(p?.gmv ?? 0) },
    { label: '转化率', value: formatPercent(p?.conversionRate ?? 0) },
    {
      label: '核销率',
      value: formatPercent(p?.verifyRate ?? 0),
      style:
        p && p.orders > 0 && p.verifyRate < 0.5 ? { color: 'var(--el-color-warning)' } : undefined
    },
    {
      label: '退款率',
      value: formatPercent(p?.refundRate ?? 0),
      style:
        p && p.orders > 0 && p.refundRate > 0.1 ? { color: 'var(--el-color-danger)' } : undefined
    }
  ];
});
</script>

<style scoped>
.task-performance-summary {
  margin-top: 20px;
}

.summary-title {
  font-weight: 600;
}
</style>
