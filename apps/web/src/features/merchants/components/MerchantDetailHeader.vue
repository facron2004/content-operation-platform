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
      <MetricTile label="30 天 GMV" :value="formatGmv(trendSummary.totalGmv)" info />
      <MetricTile label="30 天转化率" :value="formatPercent(trendSummary.conversionRate)" info />
    </div>
  </header>
</template>
<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import { formatGmv, formatPercent } from '../../../utils/format';
defineProps<{
  profile: {
    merchantName: string;
    areaName?: string | null;
    totalSku: number;
    stale30SkuCount: number;
    stale30Ratio: number;
  };
  trendSummary: { totalGmv: number; conversionRate: number };
}>();
</script>
