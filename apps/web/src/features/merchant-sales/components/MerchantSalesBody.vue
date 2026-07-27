<script setup lang="ts">
import MerchantSalesWindowBar from './MerchantSalesWindowBar.vue';
import MerchantSalesKpiRow from './MerchantSalesKpiRow.vue';
import MerchantSalesTrendPanel from './MerchantSalesTrendPanel.vue';
import MerchantSalesRankingTable from './MerchantSalesRankingTable.vue';
import MerchantSalesEmptyDay from './MerchantSalesEmptyDay.vue';

export type MerchantSalesBodyProps = {
  summary: {
    totalGmv?: number;
    refundRate?: number;
    verifyRate?: number;
    paidOrderCount?: number;
  } | null;
  windowLabel: string;
  windowRange: string;
  loading: boolean;
  gmvLabel: string;
  trendOption: Record<string, unknown>;
  ranking: {
    items: Array<Record<string, unknown>>;
    pagination: { total: number };
    truncated?: boolean;
    limit?: number;
    totalMerchants?: number;
  };
  rankingPagination: unknown;
  listLoading: boolean;
  exporting: boolean;
  rowClass: (args: { row: Record<string, unknown> }) => string;
  rateClass: (value: number, warn: number, danger: number) => string;
  rateClassInv: (value: number, warn: number, danger: number) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
};
defineProps<MerchantSalesBodyProps>();
const windowSel = defineModel<string>('windowSel', { required: true }),
  sortBy = defineModel<string>('sortBy', { required: true });
defineEmits<{
  change: [];
  'load-ranking': [];
  'page-change': [page: number];
  'size-change': [pageSize: number];
  'force-refresh': [];
}>();
</script>
<template>
  <MerchantSalesWindowBar
    v-model="windowSel"
    :summary="summary"
    :window-label="windowLabel"
    :window-range="windowRange"
    :loading="loading"
    @change="$emit('change')"
  />
  <MerchantSalesKpiRow :gmv-label="gmvLabel" :summary="summary" />
  <MerchantSalesTrendPanel
    v-if="windowSel !== 'day'"
    :window-label="windowLabel"
    :trend-option="trendOption"
  />
  <MerchantSalesRankingTable
    v-model:sort-by="sortBy"
    :ranking="ranking"
    :ranking-pagination="rankingPagination"
    :list-loading="listLoading"
    :row-class="rowClass"
    :rate-class="rateClass"
    :rate-class-inv="rateClassInv"
    :format-number="formatNumber"
    :format-percent="formatPercent"
    @load-ranking="$emit('load-ranking')"
    @page-change="$emit('page-change', $event)"
    @size-change="$emit('size-change', $event)"
  />
  <MerchantSalesEmptyDay
    v-if="!loading && !summary && windowSel === 'day'"
    :exporting="exporting"
    @force-refresh="$emit('force-refresh')"
  />
</template>
