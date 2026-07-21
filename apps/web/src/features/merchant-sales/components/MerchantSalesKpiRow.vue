<template>
  <div class="kpi-row">
    <MetricTile :label="gmvLabel" :value="formatGmv(summary?.totalGmv)" info />
    <MetricTile
      label="退款率"
      :value="formatPercent(summary?.refundRate)"
      :danger="(summary?.refundRate ?? 0) >= 0.05"
    />
    <MetricTile
      label="核销率"
      :value="formatPercent(summary?.verifyRate)"
      :danger="(summary?.verifyRate ?? 1) <= 0.6 && (summary?.verifyRate ?? 0) > 0"
    />
    <MetricTile label="成单数" :value="summary?.paidOrderCount ?? '-'" />
  </div>
</template>
<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import { formatGmv, formatPercent } from '../../../utils/format';
defineProps<{
  gmvLabel: string;
  summary: {
    totalGmv?: number;
    refundRate?: number;
    verifyRate?: number;
    paidOrderCount?: number;
  } | null;
}>();
</script>
