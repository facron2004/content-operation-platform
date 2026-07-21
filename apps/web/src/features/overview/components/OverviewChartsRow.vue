<template>
  <div class="chart-row">
    <OverviewChartCard title="近 7 日动销趋势" :option="trendOption">
      <template #controls>
        <OverviewTrendControls :trend-days="trendDays" @change="onTrendChange" />
      </template>
    </OverviewChartCard>
    <OverviewChartCard title="零动销阶梯分布" :option="distributionOption">
      <template #controls>
        <OverviewStaleControls :stale-dim="staleDim" @change="onStaleChange" />
      </template>
    </OverviewChartCard>
  </div>
</template>
<script setup lang="ts">
import type { EChartsOption } from 'echarts';
import OverviewChartCard from './OverviewChartCard.vue';
import OverviewTrendControls from './OverviewTrendControls.vue';
import OverviewStaleControls from './OverviewStaleControls.vue';
const props = defineProps<{
  trendDays: 7 | 30;
  staleDim: string;
  trendOption: EChartsOption | Record<string, unknown>;
  distributionOption: EChartsOption | Record<string, unknown>;
}>();
const emit = defineEmits<{
  'update:trendDays': [value: 7 | 30];
  'update:staleDim': [value: string];
  loadTrend: [];
  loadDistribution: [];
}>();
const onTrendChange = (v: string | number | boolean | undefined) => {
  emit('update:trendDays', Number(v) as 7 | 30);
  emit('loadTrend');
};
const onStaleChange = (v: string | number | boolean | undefined) => {
  emit('update:staleDim', String(v ?? props.staleDim));
  emit('loadDistribution');
};
</script>
