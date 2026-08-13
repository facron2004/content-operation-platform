<template>
  <section v-loading="loading" class="page-stack cockpit">
    <GmvCockpitHeader
      :kpi="kpi"
      :today-text="todayText"
      :kpi-date="kpiDate"
      :backfilling="backfilling"
      :backfill-label="backfillLabel"
      :loading="loading"
      :can-refresh="canRefresh"
      :disable-future-date="disableFutureDate"
      @update:kpi-date="kpiDate = $event"
      @date-change="onKpiDateChange"
      @backfill="onBackfillCommand"
      @backfill-date="onBackfillDate"
      @load="loadAll"
      @reload="reload"
    />
    <ErrorAlert :message="loadError" />
    <ErrorAlert :message="extrasError" />
    <GmvCockpitBody
      v-model:trend-granularity="trendGranularity"
      v-model:trend-mode="trendMode"
      v-model:dist-dim="distDim"
      v-model:merchant-sort="merchantSort"
      :kpi="kpi"
      :total-gmv-display="totalGmvDisplay"
      :trend-option="trendOption"
      :hourly-option="hourlyOption"
      :distribution-option="distributionOption"
      :top-merchants="topMerchants"
      :merchant-page="merchantPage"
      :merchant-page-size="merchantPageSize"
      :merchant-has-more="merchantHasMore"
      :merchant-truncated="merchantTruncated"
      :merchant-limit="merchantLimit"
      :distribution-truncated="distributionTruncated"
      :distribution-limit="distributionLimit"
      :distribution-matched="distributionMatched"
      :hourly-date-label="hourlyDateLabel"
      :categories="categories"
      :channels="channels"
      :funnel="funnel"
      :alerts="alerts"
      :hourly="hourly"
      @trend-change="loadTrend"
      @dist-change="loadDistribution"
      @merchants-change="loadTopMerchants"
      @merchants-prev="prevMerchantPage"
      @merchants-next="nextMerchantPage"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useGmvCockpit } from '../features/gmv/composables/useGmvCockpit';
import GmvCockpitHeader from '../features/gmv/components/GmvCockpitHeader.vue';
import GmvCockpitBody from '../features/gmv/components/GmvCockpitBody.vue';
import { useRoleStore } from '../stores/role';

const roleStore = useRoleStore();
const canRefresh = computed(() => roleStore.permissions.includes('analytics:refresh'));

const {
  loading,
  loadError,
  extrasError,
  kpi,
  topMerchants,
  merchantPage,
  merchantPageSize,
  merchantHasMore,
  merchantTruncated,
  merchantLimit,
  // Residual #289
  distributionTruncated,
  distributionLimit,
  distributionMatched,
  trendGranularity,
  trendMode,
  distDim,
  merchantSort,
  todayText,
  kpiDate,
  backfilling,
  backfillLabel,
  hourlyDateLabel,
  totalGmvDisplay,
  trendOption,
  hourlyOption,
  distributionOption,
  disableFutureDate,
  loadTrend,
  loadDistribution,
  loadTopMerchants,
  prevMerchantPage,
  nextMerchantPage,
  onKpiDateChange,
  onBackfillCommand,
  onBackfillDate,
  loadAll,
  reload,
  categories,
  channels,
  funnel,
  alerts,
  hourly
} = useGmvCockpit();
</script>

<style src="../styles/views/gmv-cockpit.css" scoped></style>
