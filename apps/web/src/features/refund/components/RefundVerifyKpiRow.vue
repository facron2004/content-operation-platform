<template>
  <div class="kpi-row">
    <MetricTile
      :label="amountLabel"
      :value="
        activeTab === 'refund'
          ? displayMoney(refundToday, 'totalRefund')
          : displayMoney(verifyToday, 'totalVerify')
      "
      info
    />
    <MetricTile
      :label="gmvLabel"
      :value="displayMoney({ totalGmv: currentGmv ?? 0 }, 'totalGmv')"
    />
    <MetricTile
      :label="rateLabel"
      :value="formatPercent(currentRate ?? 0)"
      :danger="
        activeTab === 'refund'
          ? (currentRate ?? 0) >= 0.05
          : (currentRate ?? 0) <= 0.6 && (currentRate ?? 0) > 0
      "
    />
    <MetricTile
      :label="countLabel"
      :value="
        activeTab === 'refund'
          ? (refundToday?.refundCount ?? '-')
          : (verifyToday?.verifyCount ?? '-')
      "
    />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import MetricTile from '../../../components/MetricTile.vue';
import { displayMoney, formatPercent } from '../../../utils/format';
import type { RefundVerifyTab } from '../composables/refund-verify-core';
import { REFUND_WINDOW_LABELS } from '../composables/refund-verify-core';
import type { RefundWindow } from '../../../services/api/refund.api';

const props = defineProps<{
  activeTab: RefundVerifyTab;
  /** 周期口径: 今日/本周/本月/本年, 决定 KPI 文案前缀. */
  kpiWindow: RefundWindow;
  refundToday: { totalRefund?: number; refundCount?: number } | null;
  verifyToday: { totalVerify?: number; verifyCount?: number } | null;
  currentGmv?: number;
  currentRate?: number;
}>();

// 口径跟随周期切换: 今日/本周/本月/本年. 默认按今日兜底.
const windowLabel = computed(() => REFUND_WINDOW_LABELS[props.kpiWindow] ?? '今日');
const amountLabel = computed(
  () => `${windowLabel.value}${props.activeTab === 'refund' ? '退款金额' : '核销金额'}`
);
const gmvLabel = computed(() => `${windowLabel.value} GMV`);
const rateLabel = computed(
  () => `${windowLabel.value}${props.activeTab === 'refund' ? '退款率' : '核销率'}`
);
const countLabel = computed(
  () => `${windowLabel.value}${props.activeTab === 'refund' ? '退款订单数' : '核销订单数'}`
);
</script>
