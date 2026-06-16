<template>
  <div class="metric-strip">
    <MetricTile label="销售中套餐" :value="summary.sellingCount ?? 0" />
    <MetricTile label="必推" :value="summary.mustPushCount ?? 0" info />
    <MetricTile label="风险" :value="summary.riskCount ?? 0" danger />
    <MetricTile label="爆品机会" :value="summary.hotOpportunityCount ?? 0" />
    <MetricTile label="滞销" :value="summary.slowMovingCount ?? 0" />
    <MetricTile label="社群任务" :value="summary.communityTaskCount ?? 0" />
  </div>
</template>

<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import type { ConsoleSummary } from '../composables/useDashboard';

defineProps<{
  summary: Partial<ConsoleSummary>;
}>();
</script>
