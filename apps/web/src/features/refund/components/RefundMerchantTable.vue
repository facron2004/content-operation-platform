<template>
  <section class="panel top-offenders">
    <header>
      <h3>{{ activeTab === 'refund' ? '高退款商家' : '低核销商家' }}</h3>
      <el-radio-group :model-value="sortBy" size="small" @change="onSortChange">
        <el-radio-button value="refundDesc">按 退款</el-radio-button>
        <el-radio-button value="verifyDesc">按 核销</el-radio-button>
      </el-radio-group>
    </header>
    <RefundMerchantTableBody
      :active-tab="activeTab"
      :top-merchants="topMerchants"
      :list-loading="listLoading"
      :row-class="rowClass"
      :rate-class="rateClass"
      :format-number="formatNumber"
      :format-percent="formatPercent"
    />
  </section>
</template>
<script setup lang="ts">
import type { TopMerchantRow } from '../../../services/api/refund.api';
import type { RefundVerifyTab } from '../composables/refund-verify-core';
import RefundMerchantTableBody from './RefundMerchantTableBody.vue';
const props = defineProps<{
  activeTab: RefundVerifyTab;
  sortBy: string;
  topMerchants: TopMerchantRow[];
  listLoading: boolean;
  rowClass: (args: { row: TopMerchantRow }) => string;
  rateClass: (row: TopMerchantRow, tab: RefundVerifyTab) => string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
}>();
const emit = defineEmits<{
  (e: 'update:sortBy', value: string): void;
  (e: 'load-merchants'): void;
}>();
function onSortChange(value: string | number | boolean | undefined) {
  emit('update:sortBy', String(value ?? props.sortBy));
  emit('load-merchants');
}
</script>
