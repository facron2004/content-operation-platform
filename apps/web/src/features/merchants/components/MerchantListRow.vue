<template>
  <li
    :class="{ active: merchant.merchantId === selectedMerchantId }"
    @click="emit('select', merchant.merchantId)"
  >
    <div class="merchant-list-row">
      <strong>{{ merchant.merchantName }}</strong>
      <el-tag
        size="small"
        effect="plain"
        :type="
          merchant.stale30Ratio >= 0.3
            ? 'danger'
            : merchant.stale30Ratio >= 0.1
              ? 'warning'
              : 'success'
        "
      >
        {{ (merchant.stale30Ratio * 100).toFixed(0) }}% 滞销
      </el-tag>
    </div>
    <div class="merchant-list-meta">
      <span>{{ merchant.areaName || '—' }}</span>
      <span>{{ merchant.totalSku }} SKU</span>
      <span>30 天 {{ displayMoney(merchant, 'totalGmv30d') }}</span>
    </div>
  </li>
</template>
<script setup lang="ts">
import { displayMoney } from '../../../utils/format';
defineProps<{
  merchant: {
    merchantId: string;
    merchantName: string;
    areaName?: string | null;
    totalSku: number;
    totalGmv30d: number;
    stale30Ratio: number;
  };
  selectedMerchantId?: string | null;
}>();
const emit = defineEmits<{ (e: 'select', merchantId: string): void }>();
</script>
