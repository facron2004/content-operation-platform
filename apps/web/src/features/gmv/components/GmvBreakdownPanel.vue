<template>
  <section class="panel breakdown">
    <header class="breakdown-head">
      <h3>GMV 构成（披露口径）</h3>
      <p class="muted">
        ¥ {{ formatNumber(totalGmvDisplay) }} = 在线现金 + 余额支付（积分抵现不计入 GMV）
      </p>
    </header>
    <div class="breakdown-bars">
      <div class="breakdown-bar" :style="{ width: barGmvOnline + '%' }">
        <span class="bar-label">在线 {{ formatPercentRaw(barGmvOnline) }}</span>
        <span class="bar-value">¥ {{ formatNumber(kpi?.gmvOnline) }}</span>
      </div>
      <div class="breakdown-bar bar-wallet" :style="{ width: barGmvWallet + '%' }">
        <span class="bar-label">余额 {{ formatPercentRaw(barGmvWallet) }}</span>
        <span class="bar-value">¥ {{ formatNumber(kpi?.gmvWallet) }}</span>
      </div>
    </div>
    <p class="muted small">
      积分抵现 ¥ {{ formatNumber(kpi?.gmvBonus ?? 0) }}（支付方式,不计入 GMV）； 储值卡 ¥
      {{ formatNumber(kpi?.gmvCard ?? 0) }}
    </p>
  </section>
</template>
<script setup lang="ts">
import { formatNumber, formatPercentRaw } from '../../../utils/format';
defineProps<{
  kpi: { gmvOnline?: number; gmvWallet?: number; gmvBonus?: number; gmvCard?: number } | null;
  totalGmvDisplay: number;
  barGmvOnline: number;
  barGmvWallet: number;
}>();
</script>
