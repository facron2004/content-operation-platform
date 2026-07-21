<template>
  <section v-loading="loading" class="page-stack performance-console">
    <ErrorAlert :message="loadError" />
    <PerformanceReviewBoard :review="perf.review" />
    <PerformanceChartsGrid :version-option="versionOption" :channel-option="channelOption" />
    <PerformanceItemsTable :items="perf.items ?? []" />
  </section>
</template>
<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import PerformanceReviewBoard from '../features/performance/components/PerformanceReviewBoard.vue';
import PerformanceItemsTable from '../features/performance/components/PerformanceItemsTable.vue';
import PerformanceChartsGrid from '../features/performance/components/PerformanceChartsGrid.vue';
import { usePerformancePage } from '../features/performance/composables/usePerformancePage';
const { loading, loadError, perf, versionOption, channelOption } = usePerformancePage();
</script>
<style src="../styles/views/performance.css" scoped></style>
