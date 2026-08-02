<template>
  <section v-loading="loading" class="page-stack cockpit">
    <GmvCockpitHeader
      :kpi="kpi"
      :today-text="todayText"
      :kpi-date="kpiDate"
      :backfilling="backfilling"
      :backfill-label="backfillLabel"
      :loading="loading"
      :disable-future-date="disableFutureDate"
      @update:kpi-date="kpiDate = $event"
      @date-change="onKpiDateChange"
      @backfill="onBackfillCommand"
      @reload="reload"
    />
    <ErrorAlert :message="loadError" />
    <GmvCockpitBody
      v-model:trend-granularity="trendGranularity"
      v-model:trend-mode="trendMode"
      v-model:dist-dim="distDim"
      v-model:merchant-sort="merchantSort"
      :kpi="kpi"
      :total-gmv-display="totalGmvDisplay"
      :bar-gmv-online="barGmvOnline"
      :bar-gmv-wallet="barGmvWallet"
      :trend-option="trendOption"
      :hourly-option="hourlyOption"
      :distribution-option="distributionOption"
      :top-merchants="topMerchants"
      :merchant-page="merchantPage"
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
      :activities="activities"
      :heat-points="heatPoints"
      :heat-city="heatCity"
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
import ErrorAlert from '../components/ErrorAlert.vue';
import { useGmvCockpit } from '../features/gmv/composables/useGmvCockpit';
import GmvCockpitHeader from '../features/gmv/components/GmvCockpitHeader.vue';
import GmvCockpitBody from '../features/gmv/components/GmvCockpitBody.vue';

const {
  loading,
  loadError,
  kpi,
  topMerchants,
  merchantPage,
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
  barGmvOnline,
  barGmvWallet,
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
  reload,
  categories,
  channels,
  funnel,
  activities,
  heatPoints,
  heatCity,
  alerts,
  hourly
} = useGmvCockpit();
</script>

<style src="../styles/views/gmv-cockpit.css" scoped></style>
