<template>
  <section v-loading="loading" class="page-stack alerts-page">
    <AlertsHero :loading="loading" :summary="summary" @reload="load(true)" />
    <ErrorAlert :message="loadError" />
    <AlertMetrics :summary="summary" />
    <FocusPackageGrid
      :top-packages="topPackages"
      :resolving="resolving"
      @navigate="goAnalysis"
      @create-task="goCreateTask"
      @resolve-batch="resolveBatch"
    />
    <AlertListSection
      :filters="filters"
      :alerts="alerts"
      :pagination="pagination"
      :resolving="resolving"
      @update:keyword="filters.keyword = $event"
      @update:level="filters.level = $event"
      @update:type="filters.type = $event"
      @clear="clearFilters"
      @open-detail="openAlert"
      @resolve="resolve"
      @resolve-page="resolveCurrentPage"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    />
    <AlertDetailDrawer
      v-model="drawerVisible"
      :alert="selectedAlert"
      @go-analysis="goAnalysis"
      @go-battle="goBattleCard"
      @resolve="resolve"
    />
  </section>
</template>
<script setup lang="ts">
import { useAlertsPage } from '../features/alerts/composables/useAlertsPage';
import AlertMetrics from '../features/alerts/components/AlertMetrics.vue';
import FocusPackageGrid from '../features/alerts/components/FocusPackageGrid.vue';
import AlertListSection from '../features/alerts/components/AlertListSection.vue';
import AlertDetailDrawer from '../features/alerts/components/AlertDetailDrawer.vue';
import AlertsHero from '../features/alerts/components/AlertsHero.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useRouter } from 'vue-router';
const {
  loading,
  resolving,
  loadError,
  alerts,
  summary,
  topPackages,
  filters,
  pagination,
  drawerVisible,
  selectedAlert,
  load,
  resolve,
  resolveBatch,
  resolveCurrentPage,
  clearFilters,
  handlePageChange,
  handleSizeChange,
  openAlert,
  goAnalysis,
  goBattleCard
} = useAlertsPage();
const _router = useRouter();
function goCreateTask(packageId: string) {
  _router.push({ name: 'tasks', query: { packageId } });
}
</script>
<style src="../styles/views/alerts.css" scoped></style>
