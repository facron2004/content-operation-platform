<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleButton from '../components/AppleButton.vue';
import RefundMerchantTable from '../features/refund/components/RefundMerchantTable.vue';
import RefundVerifyKpiRow from '../features/refund/components/RefundVerifyKpiRow.vue';
import RefundVerifyTrend from '../features/refund/components/RefundVerifyTrend.vue';
import { useRefundVerify } from '../features/refund/composables/useRefundVerify';
import type { RefundWindow } from '../services/api/refund.api';
const ChartPanel = defineAsyncComponent(() => import('../components/ChartPanel.vue')),
  {
    loading,
    listLoading,
    kpiError,
    trendError,
    merchantError,
    activeTab,
    trendDays,
    sortBy,
    kpiDate,
    kpiWindow,
    trendBucket,
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

const WINDOWS: { label: string; value: RefundWindow }[] = [
  { label: '今日', value: 'day' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' }
];

function onKpiDateChange(value: string | null) {
  const next = value ?? '';
  if (next === kpiDate.value) return;
  kpiDate.value = next;
  reload();
}

function onWindowChange(value: string | number | boolean) {
  kpiWindow.value = value as RefundWindow;
  reload();
}
</script>
<template>
  <section v-loading="loading" class="page-stack refund-view">
    <div class="page-toolbar">
      <span class="page-toolbar__label">业务日</span>
      <el-date-picker
        :model-value="kpiDate || undefined"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="业务日(默认今天)"
        clearable
        style="width: 170px"
        @update:model-value="onKpiDateChange"
      />
      <span class="page-toolbar__label">周期</span>
      <el-radio-group :model-value="kpiWindow" size="small" @update:model-value="onWindowChange">
        <el-radio-button v-for="w in WINDOWS" :key="w.value" :value="w.value">
          {{ w.label }}
        </el-radio-button>
      </el-radio-group>
      <AppleButton size="sm" variant="secondary" :loading="loading" @click="reload(true)">
        重新加载本地数据
      </AppleButton>
    </div>
    <ErrorAlert :message="kpiError" />
    <el-tabs v-model="activeTab" @tab-change="reload()">
      <el-tab-pane label="退款分析" name="refund" />
      <el-tab-pane label="核销分析" name="verify" />
    </el-tabs>
    <RefundVerifyKpiRow
      :active-tab="activeTab"
      :kpi-window="kpiWindow"
      :refund-today="refundToday"
      :verify-today="verifyToday"
      :current-gmv="currentGmv"
      :current-rate="currentRate"
    />
    <RefundVerifyTrend
      :active-tab="activeTab"
      :trend-days="trendDays"
      :trend-bucket="trendBucket"
      @update:trend-days="trendDays = $event === 30 ? 30 : 7"
      @update:trend-bucket="trendBucket = $event"
      @change="loadTrend"
    >
      <ChartPanel :option="trendOption" />
    </RefundVerifyTrend>
    <ErrorAlert :message="trendError" />
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
    <ErrorAlert :message="merchantError" />
  </section>
</template>
<style src="../styles/views/refund-verify.css" scoped></style>
