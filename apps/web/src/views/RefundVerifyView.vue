<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import RefundMerchantTable from '../features/refund/components/RefundMerchantTable.vue';
import RefundVerifyKpiRow from '../features/refund/components/RefundVerifyKpiRow.vue';
import RefundVerifyHero from '../features/refund/components/RefundVerifyHero.vue';
import RefundVerifyTrend from '../features/refund/components/RefundVerifyTrend.vue';
import { useRefundVerify } from '../features/refund/composables/useRefundVerify';
const ChartPanel = defineAsyncComponent(() => import('../components/ChartPanel.vue')),
  {
    loading,
    listLoading,
    loadError,
    activeTab,
    trendDays,
    sortBy,
    kpiDate,
    merchantPage,
    merchantHasMore,
    merchantTruncated,
    merchantLimit,
    refundToday,
    verifyToday,
    topMerchants,
    currentGmv,
    currentRate,
    trendOption,
    loadTrend,
    loadTopMerchants,
    prevMerchantPage,
    nextMerchantPage,
    reload,
    rowClass,
    rateClass,
    formatNumber,
    formatPercent
  } = useRefundVerify();
</script>
<template>
  <section v-loading="loading" class="page-stack refund-view">
    <RefundVerifyHero
      v-model:kpi-date="kpiDate"
      :loading="loading"
      @reload="reload"
      @date-change="reload"
    />
    <ErrorAlert :message="loadError" />
    <el-tabs v-model="activeTab" @tab-change="reload">
      <el-tab-pane label="退款分析" name="refund" />
      <el-tab-pane label="核销分析" name="verify" />
    </el-tabs>
    <RefundVerifyKpiRow
      :active-tab="activeTab"
      :refund-today="refundToday"
      :verify-today="verifyToday"
      :current-gmv="currentGmv"
      :current-rate="currentRate"
    />
    <RefundVerifyTrend
      :active-tab="activeTab"
      :trend-days="trendDays"
      :trend-option="trendOption"
      @update:trend-days="trendDays = $event === 30 ? 30 : 7"
      @change="loadTrend"
    >
      <ChartPanel :option="trendOption" />
    </RefundVerifyTrend>
    <RefundMerchantTable
      v-model:sort-by="sortBy"
      :active-tab="activeTab"
      :top-merchants="topMerchants"
      :list-loading="listLoading"
      :page="merchantPage"
      :has-more="merchantHasMore"
      :truncated="merchantTruncated"
      :limit="merchantLimit"
      :row-class="rowClass"
      :rate-class="rateClass"
      :format-number="formatNumber"
      :format-percent="formatPercent"
      @load-merchants="loadTopMerchants"
      @prev="prevMerchantPage"
      @next="nextMerchantPage"
    />
  </section>
</template>
<style src="../styles/views/refund-verify.css" scoped></style>
