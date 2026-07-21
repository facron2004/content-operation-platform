<template>
  <el-table
    v-loading="listLoading"
    :data="topMerchants"
    size="small"
    empty-text="暂无数据"
    :row-class-name="rowClass"
  >
    <el-table-column prop="merchantName" label="商家" min-width="220" show-overflow-tooltip />
    <el-table-column prop="areaName" label="区域" min-width="100">
      <template #default="{ row }">{{ row.areaName || '—' }}</template>
    </el-table-column>
    <RefundMerchantAmountColumns
      :active-tab="activeTab"
      :rate-class="rateClass"
      :format-number="formatNumber"
      :format-percent="formatPercent"
    />
    <el-table-column prop="paidOrderCount" label="成单数" width="100" align="right" />
  </el-table>
</template>
<script setup lang="ts">
import type { TopMerchantRow } from '../../../services/api/refund.api';
import type { RefundVerifyTab } from '../composables/refund-verify-core';
import RefundMerchantAmountColumns from './RefundMerchantAmountColumns.vue';
defineProps<{
  activeTab: RefundVerifyTab;
  topMerchants: TopMerchantRow[];
  listLoading: boolean;
  rowClass: (args: { row: TopMerchantRow }) => string;
  rateClass: (row: TopMerchantRow, tab: RefundVerifyTab) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
}>();
</script>
