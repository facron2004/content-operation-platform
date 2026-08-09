<script setup lang="ts">
import ZeroSalesKpiRow from './ZeroSalesKpiRow.vue';
import ZeroSalesChartsRow from './ZeroSalesChartsRow.vue';
import ZeroSalesFilters from './ZeroSalesFilters.vue';
import ZeroSalesTabs from './ZeroSalesTabs.vue';
import ZeroSalesTimelineDrawer from './ZeroSalesTimelineDrawer.vue';
import type { useZeroSalesPage } from '../composables/useZeroSalesPage';
import { useZeroSalesPageBody } from './zero-sales-page-body';
import { useZeroSalesTimeline } from '../composables/useZeroSalesTimeline';
const props = defineProps<{ page: ReturnType<typeof useZeroSalesPage> }>();
const {
  overviewKpi,
  dim,
  staleOption,
  dimOption,
  staleBucket,
  activeTab,
  filters,
  merchantRows,
  merchantLoading,
  merchantPage,
  merchantHasMore,
  merchantTruncated,
  merchantLimit,
  skuRows,
  skuLoading,
  skuPage,
  skuHasMore,
  skuTruncated,
  skuLimit
} = useZeroSalesPageBody(props.page);

// Residual #211: per-SKU stock/sales timeline drawer (mirrors movement #210).
// Residual #234: setDays re-fetches with operator-selected window (7–90).
const {
  drawerVisible: timelineDrawerVisible,
  loading: timelineLoading,
  packageId: timelinePackageId,
  packageName: timelinePackageName,
  merchantName: timelineMerchantName,
  days: timelineDays,
  timeline: timelinePoints,
  error: timelineError,
  open: openTimeline,
  setDays: setTimelineDays
} = useZeroSalesTimeline();
</script>
<template>
  <ZeroSalesKpiRow :kpi="overviewKpi" />
  <ZeroSalesChartsRow
    :dim="dim"
    :stale-option="staleOption"
    :dim-option="dimOption"
    @update:dim="dim = $event"
    @dim-change="page.loadDim"
    @stale-click="page.onStaleBarClick"
  />
  <ZeroSalesFilters
    :stale-bucket="staleBucket"
    :active-tab="activeTab"
    :filters="filters"
    @bucket-change="page.onBucketChange"
    @update:area-id="filters.areaId = $event"
    @update:merchant-id="filters.merchantId = $event"
    @update:category="filters.category = $event"
    @update:sort="filters.sort = $event as typeof filters.sort"
    @update:search="filters.search = $event"
    @filter-change="page.onFilterChange"
    @export="page.exportCsv"
  />
  <ZeroSalesTabs
    v-model="activeTab"
    :merchant-rows="merchantRows"
    :merchant-loading="merchantLoading"
    :merchant-page="merchantPage"
    :merchant-has-more="merchantHasMore"
    :merchant-truncated="merchantTruncated"
    :merchant-limit="merchantLimit"
    :sku-rows="skuRows"
    :sku-loading="skuLoading"
    :sku-page="skuPage"
    :sku-has-more="skuHasMore"
    :sku-truncated="skuTruncated"
    :sku-limit="skuLimit"
    :merchant-row-class="page.merchantRowClass"
    :sku-row-class="page.skuRowClass"
    @tab-change="page.onTabChange"
    @prev-merchant="page.prevPage('merchant')"
    @next-merchant="page.nextPage('merchant')"
    @prev-sku="page.prevPage('sku')"
    @next-sku="page.nextPage('sku')"
    @drill="page.goMerchantDetail"
    @analysis="page.goAnalysis"
    @generate="page.goGenerate"
    @timeline="openTimeline"
  />
  <!-- Residual #211: stock/sales timeline (API + client existed unused). -->
  <ZeroSalesTimelineDrawer
    v-model="timelineDrawerVisible"
    :loading="timelineLoading"
    :package-id="timelinePackageId"
    :package-name="timelinePackageName"
    :merchant-name="timelineMerchantName"
    :days="timelineDays"
    :timeline="timelinePoints"
    :error="timelineError"
    @change-days="setTimelineDays"
  />
</template>
