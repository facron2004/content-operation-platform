<script setup lang="ts">
import { formatTime } from '../utils/labels';
import { useDashboardPage } from '../features/dashboard/composables/useDashboardPage';
import DashboardMetrics from '../features/dashboard/components/DashboardMetrics.vue';
import DashboardTaskMetrics from '../features/dashboard/components/DashboardTaskMetrics.vue';
import DashboardFocusSections from '../features/dashboard/components/DashboardFocusSections.vue';
import DashboardHero from '../features/dashboard/components/DashboardHero.vue';
import DashboardFocusToggle from '../features/dashboard/components/DashboardFocusToggle.vue';
import ErrorAlert from '../components/ErrorAlert.vue';
const {
  loading,
  loadError,
  consoleData,
  activeFocus,
  summary,
  todayText,
  load,
  openAnalysis,
  goBattleCard,
  activeFocusLabel
} = useDashboardPage();
</script>
<template>
  <section v-loading="loading" class="page-stack ops-console">
    <DashboardHero
      :date-label="consoleData.date || todayText"
      :data-source="summary.dataSource"
      :updated-at-label="formatTime(summary.updatedAt)"
      :avg-score="summary.avgScore"
      :active-alert-count="summary.activeAlertCount"
      :resolved-alert-count="summary.resolvedAlertCount"
      :active-focus-label="activeFocusLabel"
      :loading="loading"
      @reload="load(true)"
    />
    <ErrorAlert :message="loadError" />
    <DashboardMetrics :summary="summary" />
    <DashboardTaskMetrics />
    <DashboardFocusToggle v-model="activeFocus" />
    <DashboardFocusSections
      :active-focus="activeFocus"
      :console-data="consoleData"
      @open="openAnalysis"
      @generate="goBattleCard"
      @navigate="$router.push($event)"
    />
  </section>
</template>
<style src="../styles/views/dashboard.css" scoped></style>
