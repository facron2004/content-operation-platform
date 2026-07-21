<template>
  <div class="kpi-row">
    <MetricTile label="总商家数" :value="kpi?.totalMerchants ?? '-'" />
    <MetricTile label="总 SKU（活跃）" :value="kpi?.totalSkus ?? '-'" />
    <MetricTile
      label="零动销商家数（30d）"
      :value="kpi?.zeroSalesMerchants ?? '-'"
      :danger="(kpi?.zeroSalesMerchants ?? 0) > 0"
      clickable
      hint="点击查看零动销清单"
      @activate="$emit('go-zero-sales')"
    />
    <MetricTile
      label="零动销 SKU 占比"
      :value="formatPercent(kpi?.zeroSalesSkuRatio)"
      :danger="(kpi?.zeroSalesSkuRatio ?? 0) >= 0.1"
      clickable
      :hint="kpi ? `零动销 SKU ${formatCount(kpi.zeroSalesSkuCount)}` : undefined"
      @activate="$emit('go-zero-sales')"
    />
    <MetricTile label="今日 GMV" :value="formatGmv(kpi?.todayGmv)" info />
    <MetricTile label="今日成单数" :value="kpi?.todayOrderCount ?? '-'" />
  </div>
</template>
<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import { formatCount, formatGmv, formatPercent } from '../../../utils/format';
type Kpi = {
  totalMerchants?: number;
  totalSkus?: number;
  zeroSalesMerchants?: number;
  zeroSalesSkuCount?: number;
  zeroSalesSkuRatio?: number;
  todayGmv?: number;
  todayOrderCount?: number;
} | null;
defineProps<{ kpi: Kpi }>();
defineEmits<{ 'go-zero-sales': [] }>();
</script>
<style scoped>
.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 1280px) {
  .kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 768px) {
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
