<template>
  <div class="kpi-row">
    <MetricTile
      :label="activeTab === 'refund' ? '今日退款金额' : '今日核销金额'"
      :value="
        formatGmv(activeTab === 'refund' ? refundToday?.totalRefund : verifyToday?.totalVerify)
      "
      info
    />
    <MetricTile label="今日 GMV" :value="formatGmv(currentGmv ?? 0)" />
    <MetricTile
      :label="activeTab === 'refund' ? '退款率' : '核销率'"
      :value="formatPercent(currentRate ?? 0)"
      :danger="
        activeTab === 'refund'
          ? (currentRate ?? 0) >= 0.05
          : (currentRate ?? 0) <= 0.6 && (currentRate ?? 0) > 0
      "
    />
    <MetricTile
      :label="activeTab === 'refund' ? '退款订单数' : '核销订单数'"
      :value="
        activeTab === 'refund'
          ? (refundToday?.refundCount ?? '-')
          : (verifyToday?.verifyCount ?? '-')
      "
    />
  </div>
</template>
<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import { formatGmv, formatPercent } from '../../../utils/format';
import type { RefundVerifyTab } from '../composables/refund-verify-core';
defineProps<{
  activeTab: RefundVerifyTab;
  refundToday: { totalRefund?: number; refundCount?: number } | null;
  verifyToday: { totalVerify?: number; verifyCount?: number } | null;
  currentGmv?: number;
  currentRate?: number;
}>();
</script>
