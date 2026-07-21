<template>
  <div class="kpi-row">
    <MetricTile label="活跃 SKU" :value="today?.activeSkus ?? '-'" hint="当前有库存的套餐数" />
    <MetricTile label="今日动销" :value="today?.movingSkus ?? '-'" info hint="今日有销量的 SKU" />
    <MetricTile
      label="不动销 SKU"
      :value="today?.stagnantSkus ?? '-'"
      :danger="(today?.stagnantSkus ?? 0) > 0"
      hint="有库存且近期无销"
    />
    <MetricTile
      label="动销率"
      :value="formatPercent(today?.movingRate)"
      :hint="today ? `动销 ${today.movingSkus ?? 0} / 活跃 ${today.activeSkus ?? 0}` : undefined"
    />
  </div>
</template>
<script setup lang="ts">
import MetricTile from '../../../components/MetricTile.vue';
import { formatPercent } from '../../../utils/format';
defineProps<{
  today: {
    activeSkus?: number;
    movingSkus?: number;
    stagnantSkus?: number;
    movingRate?: number;
  } | null;
}>();
</script>
