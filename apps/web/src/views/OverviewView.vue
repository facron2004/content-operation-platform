<template>
  <section v-loading="loading" class="page-stack overview">
    <OverviewHero
      v-model:kpi-date="kpiDate"
      :date-label="kpi?.date || kpiDate || todayText"
      :data-source="kpi?.dataSource"
      :updated-at-label="formatTime(kpi?.updatedAt)"
      :loading="loading"
      @reload="reload"
      @date-change="reload"
    />
    <ErrorAlert :message="loadError" />
    <OverviewKpiRow :kpi="kpi" @go-zero-sales="goZeroSales()" />
    <OverviewChartsRow
      v-model:trend-days="trendDays"
      v-model:stale-dim="staleDim"
      :trend-option="trendOption"
      :distribution-option="distributionOption"
      :distribution-truncated="distributionTruncated"
      :distribution-limit="distributionLimit"
      :distribution-matched="distributionMatched"
      @load-trend="loadTrend"
      @load-distribution="loadDistribution"
    />
    <OverviewOffendersTable
      :items="topOffenders"
      :loading="offendersLoading"
      :empty-text="offendersEmptyText"
      :row-class="offenderRowClass"
      :truncated="offendersTruncated"
      :limit="offendersLimit"
      :matched="offendersMatched"
      @go-zero-sales="goZeroSales"
    />
  </section>
</template>
<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import { formatTime } from '../utils/labels';
import { useOverview } from '../features/overview/composables/useOverview';
import OverviewOffendersTable from '../features/overview/components/OverviewOffendersTable.vue';
import OverviewKpiRow from '../features/overview/components/OverviewKpiRow.vue';
import OverviewHero from '../features/overview/components/OverviewHero.vue';
import OverviewChartsRow from '../features/overview/components/OverviewChartsRow.vue';
const {
  loading,
  loadError,
  kpi,
  topOffenders,
  offendersLoading,
  // Residual #287
  offendersTruncated,
  offendersLimit,
  offendersMatched,
  // Residual #288
  distributionTruncated,
  distributionLimit,
  distributionMatched,
  todayText,
  kpiDate,
  trendDays,
  staleDim,
  trendOption,
  distributionOption,
  offendersEmptyText,
  reload,
  loadTrend,
  loadDistribution,
  goZeroSales,
  offenderRowClass
} = useOverview();
</script>
<style src="../styles/views/overview.css" scoped></style>
