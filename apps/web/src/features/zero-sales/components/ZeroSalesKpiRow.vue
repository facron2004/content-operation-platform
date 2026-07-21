<template>
  <div>
    <div class="kpi-row">
      <MetricTile
        label="零动销商家"
        :value="kpi?.zeroSalesMerchants ?? '-'"
        :danger="(kpi?.zeroSalesMerchants ?? 0) > 0"
        hint="总览口径 · 30d"
      />
      <MetricTile
        label="零动销 SKU"
        :value="kpi?.zeroSalesSkuCount ?? '-'"
        :danger="(kpi?.zeroSalesSkuCount ?? 0) > 0"
        hint="总览口径 · 30d"
      />
      <MetricTile
        label="零动销 SKU 占比"
        :value="formatPercent(kpi?.zeroSalesSkuRatio)"
        :danger="(kpi?.zeroSalesSkuRatio ?? 0) >= 0.1"
        :hint="kpi ? `活跃 SKU ${formatCount(kpi.totalSkus)}` : undefined"
      />
      <MetricTile
        label="总商家 / 活跃 SKU"
        :value="merchantSkuLabel"
        info
        hint="总览口径，不受下方阶梯筛选影响"
      />
    </div>
    <p class="scope-note">上方 KPI 来自总览 30d 口径，与下方阶梯筛选独立。</p>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import MetricTile from '../../../components/MetricTile.vue';
import { formatCount, formatPercent } from '../../../utils/format';
import type { OverviewKpi } from '../../../services/api/overview.api';
const props = defineProps<{ kpi: OverviewKpi | null }>(),
  merchantSkuLabel = computed(() =>
    !props.kpi
      ? '-'
      : `${formatCount(props.kpi.totalMerchants)} / ${formatCount(props.kpi.totalSkus)}`
  );
</script>
