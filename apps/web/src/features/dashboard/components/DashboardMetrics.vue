<template>
  <div class="metric-strip metric-summary-strip">
    <MetricTile label="销售中套餐" :value="summary.sellingCount" />
    <MetricTile label="必推" :value="summary.mustPushCount" info />
    <MetricTile label="风险" :value="summary.riskCount" danger />
    <MetricTile label="爆品机会" :value="summary.hotOpportunityCount" />
    <MetricTile label="滞销" :value="summary.slowMovingCount" />
    <MetricTile label="社群任务" :value="summary.communityTaskCount" />
  </div>
</template>

<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import type { ConsoleSummary } from '../composables/useDashboard';

defineProps<{
  summary: ConsoleSummary;
}>();
</script>

<style scoped>
.metric-summary-strip {
  margin-top: 2px;
}
</style>
