<template>
  <section v-loading="loading" class="page-stack merchants-view">
    <MerchantHero :loading="loading" @reload="reload">
      <template #title>
        {{ selectedMerchant ? selectedMerchant.merchantName : '商家清单' }}
      </template>
    </MerchantHero>
    <ErrorAlert :message="listError" />
    <ErrorAlert :message="detailError" />
    <div class="layout-grid">
      <MerchantListPanel
        v-model:search="search"
        v-model:area-id="areaId"
        v-model:sort="sort"
        :merchants="merchants"
        :sort-options="sortOptions"
        :page="page"
        :has-more="hasMore"
        :truncated="listTruncated"
        :limit="listLimit"
        :selected-merchant-id="selectedMerchantId"
        :list-height="listHeight"
        @filter-change="onFilterChange"
        @select="selectMerchant"
        @prev="prevPage"
        @next="nextPage"
      />
      <MerchantDetailPanel
        :detail-loading="detailLoading"
        :profile="profile"
        :sku-list="skuList"
        :competitors="competitors"
        :trend-summary="trendSummary"
        :trend-option="trendOption"
        :detail-days="detailDays"
        :detail-day-options="detailDayOptions"
        :sku-truncated="skuTruncated"
        :sku-limit="skuLimit"
        :competitors-truncated="competitorsTruncated"
        :competitors-limit="competitorsLimit"
        :competitors-matched="competitorsMatched"
        :stale-color="(b: string) => staleColor(b as never)"
        :stale-label="(b: string) => staleLabel(b as never)"
        @go-zero-sales="goZeroSalesForMerchant"
        @go-analysis="goAnalysis"
        @change-days="setDetailDays"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import { useMerchants } from '../features/merchants/composables/useMerchants';
import MerchantHero from '../features/merchants/components/MerchantHero.vue';
import MerchantListPanel from '../features/merchants/components/MerchantListPanel.vue';
import MerchantDetailPanel from '../features/merchants/components/MerchantDetailPanel.vue';
const {
  loading,
  detailLoading,
  listError,
  detailError,
  merchants,
  search,
  areaId,
  sort,
  sortOptions,
  page,
  hasMore,
  // Residual #266: MERCHANT_LIST_CACHE_CAP honesty.
  listTruncated,
  listLimit,
  selectedMerchantId,
  selectedMerchant,
  profile,
  skuList,
  competitors,
  detailDays,
  detailDayOptions,
  skuTruncated,
  skuLimit,
  // Residual #285: MERCHANT_COMPETITORS_LIMIT honesty.
  competitorsTruncated,
  competitorsLimit,
  competitorsMatched,
  listHeight,
  trendSummary,
  trendOption,
  reload,
  onFilterChange,
  selectMerchant,
  prevPage,
  nextPage,
  goZeroSalesForMerchant,
  goAnalysis,
  setDetailDays,
  staleColor,
  staleLabel
} = useMerchants();
</script>
<style src="../styles/views/merchants.css" scoped></style>
