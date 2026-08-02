<script setup lang="ts">
import type { TopMerchantRow } from '../../../services/api/refund.api';
import type { RefundVerifyTab } from '../composables/refund-verify-core';
defineProps<{
  activeTab: RefundVerifyTab;
  rateClass: (row: TopMerchantRow, tab: RefundVerifyTab) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
}>();
</script>
<template>
  <el-table-column label="GMV" width="120" align="right">
    <template #default="{ row }">¥ {{ formatNumber(row.gmv) }}</template>
  </el-table-column>
  <el-table-column
    :label="activeTab === 'refund' ? '退款金额' : '核销金额'"
    width="120"
    align="right"
  >
    <template #default="{ row }">
      ¥ {{ formatNumber(activeTab === 'refund' ? row.refund : row.verify) }}
    </template>
  </el-table-column>
  <el-table-column :label="activeTab === 'refund' ? '退款率' : '核销率'" width="100" align="right">
    <template #default="{ row }">
      <span :class="rateClass(row, activeTab)">
        {{ formatPercent(activeTab === 'refund' ? row.refundRate : row.verifyRate) }}
      </span>
    </template>
  </el-table-column>
</template>
