<template>
  <header class="detail-header">
    <div>
      <h3>{{ profile.merchantName }}</h3>
      <p class="detail-meta">{{ profile.areaName || '—' }} / {{ profile.totalSku }} SKU</p>
    </div>
    <div class="detail-stats">
      <MetricTile
        label="30 天零动销 SKU"
        :value="profile.stale30SkuCount"
        :danger="profile.stale30SkuCount > 0"
      />
      <MetricTile
        label="零动销占比"
        :value="formatPercent(profile.stale30Ratio)"
        :danger="profile.stale30Ratio >= 0.1"
      />
      <!-- Residual #235: GMV/转化 labels follow selected trend window. -->
      <MetricTile :label="`${detailDays} 天 GMV`" :value="formatGmv(trendSummary.totalGmv)" info />
      <MetricTile
        :label="`${detailDays} 天转化率`"
        :value="formatPercent(trendSummary.conversionRate)"
        info
      />
    </div>
  </header>
</template>
<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import { formatGmv, formatPercent } from '../../../utils/format';
withDefaults(
  defineProps<{
    profile: {
      merchantName: string;
      areaName?: string | null;
      totalSku: number;
      stale30SkuCount: number;
      stale30Ratio: number;
    };
    trendSummary: { totalGmv: number; conversionRate: number };
    // Residual #235: mirrors operator-selected MerchantTrendQueryDto days.
    detailDays?: number;
  }>(),
  { detailDays: 30 }
);
</script>
