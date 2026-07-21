<template>
  <el-card v-loading="loading" class="task-summary">
    <template #header>
      <span class="summary-title">任务 KPI 概览</span>
    </template>
    <el-row v-if="kpis" :gutter="16">
      <el-col v-for="metric in metrics" :key="metric.label" :xs="12" :sm="8" :md="4">
        <el-statistic :title="metric.label" :value="metric.value" :value-style="metric.style" />
      </el-col>
    </el-row>
    <el-empty v-else-if="!loading" description="暂无 KPI 数据" :image-size="60" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { TaskKpiResponse } from '@content/shared';
import { formatGmv } from '../../../utils/format';

interface SummaryMetric {
  label: string;
  value: number | string;
  style?: CSSProperties;
}

const props = withDefaults(
  defineProps<{
    kpis: TaskKpiResponse | null;
    loading?: boolean;
  }>(),
  { loading: false }
);

const metrics = computed<SummaryMetric[]>(() => {
  const k = props.kpis;
  return [
    { label: '今日待处理', value: k?.todayPending ?? 0 },
    { label: '进行中', value: k?.inProgress ?? 0 },
    { label: '已完成', value: k?.completed ?? 0 },
    {
      label: '已逾期',
      value: k?.overdue ?? 0,
      style: k && k.overdue > 0 ? { color: 'var(--el-color-warning)' } : undefined
    },
    {
      label: '已失败',
      value: k?.failed ?? 0,
      style: k && k.failed > 0 ? { color: 'var(--el-color-danger)' } : undefined
    },
    { label: '今日任务 GMV', value: formatGmv(k?.todayTaskGmv ?? 0) }
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
