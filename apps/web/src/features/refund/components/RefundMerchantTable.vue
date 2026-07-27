<template>
  <section class="panel top-offenders">
    <header>
      <h3>{{ activeTab === 'refund' ? '高退款商家' : '低核销商家' }}</h3>
      <el-radio-group :model-value="sortBy" size="small" @change="onSortChange">
        <el-radio-button value="refundDesc">按 退款</el-radio-button>
        <el-radio-button value="verifyDesc">按 核销</el-radio-button>
      </el-radio-group>
    </header>
    <!-- Residual #265: ranking head is capped at GMV_TOP_MERCHANTS_LIMIT. -->
    <p v-if="truncated" class="ranking-cap-hint">
      排行仅加载前 {{ limitLabel }} 家商家；分页在该上限内切换。
    </p>
    <RefundMerchantTableBody
      :active-tab="activeTab"
      :top-merchants="topMerchants"
      :list-loading="listLoading"
      :row-class="rowClass"
      :rate-class="rateClass"
      :format-number="formatNumber"
      :format-percent="formatPercent"
    />
    <!-- Residual #229: page/hasMore (API getRefundTopMerchants already returns hasMore). -->
    <div class="pager">
      <AppleButton
        size="sm"
        variant="secondary"
        :disabled="page <= 1 || listLoading"
        @click="$emit('prev')"
      >
        上一页
      </AppleButton>
      <span class="pager-meta">第 {{ page }} 页</span>
      <AppleButton
        size="sm"
        variant="secondary"
        :disabled="!hasMore || listLoading"
        @click="$emit('next')"
      >
        下一页
      </AppleButton>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { TopMerchantRow } from '../../../services/api/refund.api';
import type { RefundVerifyTab } from '../composables/refund-verify-core';
import AppleButton from '../../../components/AppleButton.vue';
import RefundMerchantTableBody from './RefundMerchantTableBody.vue';
const props = withDefaults(
  defineProps<{
    activeTab: RefundVerifyTab;
    sortBy: string;
    topMerchants: TopMerchantRow[];
    listLoading: boolean;
    page: number;
    hasMore: boolean;
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    truncated?: boolean;
    limit?: number | null;
    rowClass: (args: { row: TopMerchantRow }) => string;
    rateClass: (row: TopMerchantRow, tab: RefundVerifyTab) => string;
    formatNumber: (value: number) => string;
    formatPercent: (value: number) => string;
  }>(),
  {
    truncated: false,
    limit: null
  }
);
const emit = defineEmits<{
  (e: 'update:sortBy', value: string): void;
  (e: 'load-merchants'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : 1000
);
function onSortChange(value: string | number | boolean | undefined) {
  emit('update:sortBy', String(value ?? props.sortBy));
  emit('load-merchants');
}
</script>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}
.pager-meta {
  font-size: 12px;
  color: #6e6e73;
}
.ranking-cap-hint {
  margin: 0 0 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  color: #92400e;
  font-size: 12px;
  line-height: 1.5;
}
</style>
