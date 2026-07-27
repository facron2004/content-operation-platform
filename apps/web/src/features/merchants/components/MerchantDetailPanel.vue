<template>
  <section v-loading="detailLoading" class="detail-panel">
    <template v-if="profile">
      <MerchantDetailHeader
        :profile="profile"
        :trend-summary="trendSummary"
        :detail-days="detailDays"
      />
      <section class="panel chart-section">
        <header class="chart-header">
          <h4>{{ detailDays }} 天 GMV / 转化趋势</h4>
          <!-- Residual #235: operator-selectable window (API days 7–90). -->
          <div class="day-options" role="group" aria-label="趋势窗口">
            <button
              v-for="opt in dayOptions"
              :key="opt"
              type="button"
              class="day-chip"
              :class="{ active: detailDays === opt }"
              :disabled="detailLoading"
              @click="onDaysChange(opt)"
            >
              {{ opt }} 天
            </button>
          </div>
        </header>
        <ChartPanel :option="trendOption" />
      </section>
      <MerchantSkuTable
        :sku-list="skuList"
        :stale-color="staleColor"
        :stale-label="staleLabel"
        :truncated="skuTruncated"
        :limit="skuLimit"
        @go-zero-sales="emit('go-zero-sales')"
        @go-analysis="(id) => emit('go-analysis', id)"
      />
      <MerchantCompetitorsTable
        :competitors="competitors"
        :truncated="competitorsTruncated"
        :limit="competitorsLimit"
        :matched="competitorsMatched"
      />
    </template>
    <el-empty v-else-if="!detailLoading" description="选择左侧商家查看详情" />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import MerchantDetailHeader from './MerchantDetailHeader.vue';
import MerchantSkuTable from './MerchantSkuTable.vue';
import MerchantCompetitorsTable from './MerchantCompetitorsTable.vue';
import type { MerchantDetailPanelProps } from './merchant-detail-panel-types';
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
const props = withDefaults(defineProps<MerchantDetailPanelProps>(), {
  detailDays: 30,
  detailDayOptions: () => [7, 14, 30, 60, 90]
});
const emit = defineEmits<{
  (e: 'go-zero-sales'): void;
  (e: 'go-analysis', packageId: string): void;
  // Residual #235: parent re-fetches trend + skus with the selected window.
  (e: 'change-days', days: number): void;
}>();
const dayOptions = computed(() => props.detailDayOptions ?? [7, 14, 30, 60, 90]);
function onDaysChange(next: number) {
  if (next === props.detailDays) return;
  emit('change-days', next);
}
</script>
<style scoped>
.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.chart-header h4 {
  margin: 0;
}
.day-options {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.day-chip {
  border: 1px solid var(--el-border-color, #dcdfe6);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}
.day-chip.active {
  border-color: var(--el-color-primary, #409eff);
  color: var(--el-color-primary, #409eff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.day-chip:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
