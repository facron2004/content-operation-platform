<script setup lang="ts">
import ZeroSalesKpiRow from './ZeroSalesKpiRow.vue';
import ZeroSalesChartsRow from './ZeroSalesChartsRow.vue';
import ZeroSalesFilters from './ZeroSalesFilters.vue';
import ZeroSalesTabs from './ZeroSalesTabs.vue';
import type { useZeroSalesPage } from '../composables/useZeroSalesPage';
import { useZeroSalesPageBody } from './zero-sales-page-body';
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
  skuRows,
  skuLoading,
  skuPage,
  skuHasMore
} = useZeroSalesPageBody(props.page);
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
    @update:category="filters.category = $event"
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
    :sku-rows="skuRows"
    :sku-loading="skuLoading"
    :sku-page="skuPage"
    :sku-has-more="skuHasMore"
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
  />
</template>
