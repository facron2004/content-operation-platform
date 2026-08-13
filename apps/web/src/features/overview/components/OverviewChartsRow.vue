<template>
  <div class="chart-row">
    <OverviewChartCard title="近 7 日动销趋势" :option="trendOption">
      <template #controls>
        <OverviewTrendControls :trend-days="trendDays" @change="onTrendChange" />
      </template>
    </OverviewChartCard>
    <OverviewChartCard
      :title="distributionTitle"
      :option="distributionOption"
      :truncated="distributionTruncated"
      :limit="distributionLimit"
      :matched="distributionMatched"
    >
      <template #controls>
        <OverviewStaleControls :stale-dim="staleDim" @change="onStaleChange" />
      </template>
    </OverviewChartCard>
  </div>
</template>
<script setup lang="ts">
import type { EChartsOption } from 'echarts';
import { computed } from 'vue';
import OverviewChartCard from './OverviewChartCard.vue';
import OverviewTrendControls from './OverviewTrendControls.vue';
import OverviewStaleControls from './OverviewStaleControls.vue';
const props = withDefaults(
  defineProps<{
    trendDays: 7 | 30;
    staleDim: string;
    trendOption: EChartsOption | Record<string, unknown>;
    distributionOption: EChartsOption | Record<string, unknown>;
    // Residual #288: distribution Top-N honesty.
    distributionTruncated?: boolean;
    distributionLimit?: number | null;
    distributionMatched?: number | null;
  }>(),
  {
    distributionTruncated: false,
    distributionLimit: null,
    distributionMatched: null
  }
);
const emit = defineEmits<{
  'update:trendDays': [value: 7 | 30];
  'update:staleDim': [value: string];
  loadTrend: [];
  loadDistribution: [];
}>();
const distributionTitle = computed(() => {
  if (props.staleDim === 'area') return '区域分布（当前商品主数据）';
  if (props.staleDim === 'category') return '品类分布（当前商品主数据）';
  return '零动销阶梯分布（所选经营日）';
});
const onTrendChange = (v: string | number | boolean | undefined) => {
  emit('update:trendDays', Number(v) as 7 | 30);
  emit('loadTrend');
};
const onStaleChange = (v: string | number | boolean | undefined) => {
  emit('update:staleDim', String(v ?? props.staleDim));
  emit('loadDistribution');
};
</script>
