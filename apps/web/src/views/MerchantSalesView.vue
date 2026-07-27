<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import MerchantSalesHero from '../features/merchant-sales/components/MerchantSalesHero.vue';
import MerchantSalesBody from '../features/merchant-sales/components/MerchantSalesBody.vue';
import { useMerchantSalesPage } from '../features/merchant-sales/composables/useMerchantSales';
const page = useMerchantSalesPage();
</script>
<template>
  <section v-loading="page.loading" class="page-stack ms-view">
    <MerchantSalesHero
      v-model:kpi-date="page.kpiDate"
      :loading="page.loading"
      :exporting="page.exporting"
      :can-export="page.ranking.items.length > 0"
      @reload="page.reload"
      @export="page.onExport"
      @date-change="page.reload"
    />
    <ErrorAlert :message="page.loadError" />
    <MerchantSalesBody
      v-model:window-sel="page.windowSel"
      v-model:sort-by="page.sortBy"
      :summary="page.summary"
      :window-label="page.windowLabel"
      :window-range="page.windowRange"
      :loading="page.loading"
      :gmv-label="page.gmvLabel"
      :trend-option="page.trendOption"
      :ranking="page.ranking"
      :ranking-pagination="page.rankingPagination"
      :list-loading="page.listLoading"
      :exporting="page.exporting"
      :row-class="page.rowClass"
      :rate-class="page.rateClass"
      :rate-class-inv="page.rateClassInv"
      :format-number="page.formatNumber"
      :format-percent="page.formatPercent"
      @change="page.onWindowChange"
      @load-ranking="page.loadRanking"
      @page-change="page.onPageChange"
      @size-change="page.onSizeChange"
      @force-refresh="page.onForceRefresh"
    />
  </section>
</template>
<style src="../styles/views/merchant-sales.css" scoped></style>
