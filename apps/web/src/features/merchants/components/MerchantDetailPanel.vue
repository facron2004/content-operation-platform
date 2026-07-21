<template>
  <section v-loading="detailLoading" class="detail-panel">
    <template v-if="profile">
      <MerchantDetailHeader :profile="profile" :trend-summary="trendSummary" />
      <section class="panel chart-section">
        <header><h4>30 天 GMV / 转化趋势</h4></header>
        <ChartPanel :option="trendOption" />
      </section>
      <MerchantSkuTable
        :sku-list="skuList"
        :stale-color="staleColor"
        :stale-label="staleLabel"
        @go-zero-sales="emit('go-zero-sales')"
        @go-analysis="(id) => emit('go-analysis', id)"
      />
      <MerchantCompetitorsTable :competitors="competitors" />
    </template>
    <el-empty v-else-if="!detailLoading" description="选择左侧商家查看详情" />
  </section>
</template>
<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import MerchantDetailHeader from './MerchantDetailHeader.vue';
import MerchantSkuTable from './MerchantSkuTable.vue';
import MerchantCompetitorsTable from './MerchantCompetitorsTable.vue';
import type { MerchantDetailPanelProps } from './merchant-detail-panel-types';
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
defineProps<MerchantDetailPanelProps>();
const emit = defineEmits<{
  (e: 'go-zero-sales'): void;
  (e: 'go-analysis', packageId: string): void;
}>();
</script>
