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
defineProps<{ summary: ConsoleSummary }>();
</script>
<style scoped>
.metric-summary-strip {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-top: 2px;
}

@media (max-width: 1280px) {
  .metric-summary-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .metric-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
