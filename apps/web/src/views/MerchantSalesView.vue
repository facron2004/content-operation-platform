<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import AppleButton from '../components/AppleButton.vue';
import MerchantSalesBody from '../features/merchant-sales/components/MerchantSalesBody.vue';
import { useMerchantSalesPage } from '../features/merchant-sales/composables/useMerchantSales';
const page = useMerchantSalesPage();
function onKpiDateChange(value: string | null) {
  const next = value ?? '';
  if (next === page.kpiDate) return;
  page.kpiDate = next;
  page.reload();
}
</script>
<template>
  <section v-loading="page.loading" class="page-stack ms-view">
    <div class="page-toolbar">
      <span class="page-toolbar__label">业务日</span>
      <el-date-picker
        :model-value="page.kpiDate || undefined"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="业务日(默认今天)"
        clearable
        style="width: 170px"
        @update:model-value="onKpiDateChange"
      />
      <AppleButton variant="secondary" size="sm" :loading="page.loading" @click="page.reload(true)">
        重新加载本地数据
      </AppleButton>
      <AppleButton
        variant="primary"
        size="sm"
        :loading="page.exporting"
        :disabled="page.ranking.items.length === 0"
        @click="page.onExport"
      >
        <template #icon>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </template>
        导出 CSV
      </AppleButton>
    </div>
    <ErrorAlert :message="page.summaryError" />
    <ErrorAlert :message="page.trendError" />
    <ErrorAlert :message="page.rankingError" />
    <ErrorAlert :message="page.refreshError" />
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
