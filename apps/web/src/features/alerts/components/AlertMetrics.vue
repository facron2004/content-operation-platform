<template>
  <div class="metric-strip alert-metrics">
    <MetricTile label="待处理" :value="summary.activeCount" danger />
    <MetricTile label="高危" :value="summary.dangerCount" danger />
    <MetricTile label="警告" :value="summary.warningCount" />
    <MetricTile label="涉及套餐" :value="summary.packageCount" />
    <MetricTile label="今日已处理" :value="summary.resolvedCount" />
  </div>
</template>
<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import type { AlertSummary } from '../composables/useAlerts';
defineProps<{ summary: AlertSummary }>();
</script>
<style scoped>
.alert-metrics {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
</style>
