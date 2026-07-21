<template>
  <section v-loading="loading" class="page-stack merchants-view">
    <MerchantHero :loading="loading" @reload="reload">
      <template #title>
        {{ selectedMerchant ? selectedMerchant.merchantName : '商家清单' }}
      </template>
    </MerchantHero>
    <ErrorAlert :message="loadError" />
    <div class="layout-grid">
      <MerchantListPanel
        v-model:search="search"
        :merchants="merchants"
        :page="page"
        :has-more="hasMore"
        :selected-merchant-id="selectedMerchantId"
        :list-height="listHeight"
        @search-change="reloadList"
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
        :stale-color="(b: string) => staleColor(b as never)"
        :stale-label="(b: string) => staleLabel(b as never)"
        @go-zero-sales="goZeroSalesForMerchant"
        @go-analysis="goAnalysis"
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
  loadError,
  merchants,
  search,
  page,
  hasMore,
  selectedMerchantId,
  selectedMerchant,
  profile,
  skuList,
  competitors,
  listHeight,
  trendSummary,
  trendOption,
  reload,
  reloadList,
  selectMerchant,
  prevPage,
  nextPage,
  goZeroSalesForMerchant,
  goAnalysis,
  staleColor,
  staleLabel
} = useMerchants();
</script>
<style src="../styles/views/merchants.css" scoped></style>
