<script setup lang="ts">
import { computed } from 'vue';
import GmvKpiRow from './GmvKpiRow.vue';
import GmvInsightRow from './GmvInsightRow.vue';
import GmvCockpitCharts from './GmvCockpitCharts.vue';
import GmvHourlyChartCard from './GmvHourlyChartCard.vue';
import GmvTopMerchantsTable from './GmvTopMerchantsTable.vue';
import GmvCockpitChartCard from './GmvCockpitChartCard.vue';
import GmvCategoryDonut from './GmvCategoryDonut.vue';
import GmvChannelBars from './GmvChannelBars.vue';
import GmvConversionFunnel from './GmvConversionFunnel.vue';
import GmvActivityTable from './GmvActivityTable.vue';
import GmvHeatmap from './GmvHeatmap.vue';
import GmvAlertsList from './GmvAlertsList.vue';
import type { GmvTrendGranularity, GmvTrendMode } from '../composables/gmv-chart-ui';
import { GMV_DIST_OPTIONS } from './gmv-cockpit-charts-ui';

import type { GmvKpi, GmvHourlyPoint } from '../../../services/api/gmv.api';
import type { GmvTopMerchant } from './gmv-cockpit-charts-ui';
import type {
  GmvActivityRow,
  GmvAlertItem,
  GmvCategoryRow,
  GmvChannelRow,
  GmvFunnelStage,
  GmvHeatPoint
} from '../composables/gmv-cockpit-core';
import { buildGmvInsights } from '../composables/gmv-insights';

export type GmvCockpitBodyProps = {
  kpi: GmvKpi | null;
  totalGmvDisplay: number;
  barGmvOnline: number;
  barGmvWallet: number;
  trendOption: Record<string, unknown>;
  hourlyOption: Record<string, unknown>;
  distributionOption: Record<string, unknown>;
  topMerchants: GmvTopMerchant[];
  merchantPage: number;
  merchantHasMore: boolean;
  // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
  merchantTruncated?: boolean;
  merchantLimit?: number | null;
  // Residual #289: GMV distribution Top-N honesty.
  distributionTruncated?: boolean;
  distributionLimit?: number | null;
  distributionMatched?: number | null;
  hourlyDateLabel?: string;
  categories: GmvCategoryRow[];
  channels: GmvChannelRow[];
  funnel: GmvFunnelStage[];
  activities: GmvActivityRow[];
  heatPoints: GmvHeatPoint[];
  heatCity: string;
  alerts: GmvAlertItem[];
  hourly: GmvHourlyPoint[];
};

const props = defineProps<GmvCockpitBodyProps>();

const trendGranularity = defineModel<GmvTrendGranularity>('trendGranularity', { required: true });
const trendMode = defineModel<GmvTrendMode>('trendMode', { required: true });
const distDim = defineModel<'area' | 'category'>('distDim', { required: true });
const merchantSort = defineModel<string>('merchantSort', { required: true });

defineEmits<{
  'trend-change': [];
  'dist-change': [];
  'merchants-change': [];
  'merchants-prev': [];
  'merchants-next': [];
}>();

const insightsData = computed(() =>
  buildGmvInsights({
    kpi: props.kpi,
    hourly: props.hourly,
    categories: props.categories
  })
);
</script>

<template>
  <!-- KPI Cards Row -->
  <GmvKpiRow :kpi="kpi" />

  <!-- Primary analysis row: trend/hourly beside the merchant ranking. -->
  <div class="cockpit-primary-row">
    <GmvCockpitCharts
      v-model:trend-granularity="trendGranularity"
      v-model:trend-mode="trendMode"
      v-model:dist-dim="distDim"
      :trend-option="trendOption"
      :hourly-option="hourlyOption"
      :distribution-option="distributionOption"
      :hourly-date-label="hourlyDateLabel"
      @trend-change="$emit('trend-change')"
      @dist-change="$emit('dist-change')"
    />

    <GmvTopMerchantsTable
      v-model:merchant-sort="merchantSort"
      :top-merchants="topMerchants"
      :page="merchantPage"
      :has-more="merchantHasMore"
      :truncated="merchantTruncated"
      :limit="merchantLimit"
      @change="$emit('merchants-change')"
      @prev="$emit('merchants-prev')"
      @next="$emit('merchants-next')"
    />
  </div>

  <!-- Insight row follows the primary analysis, matching the prototype's anomaly block. -->
  <GmvInsightRow :insights="insightsData" />

  <!-- Full-width row: Hourly + Distribution only (独立整排，只有这两个) -->
  <div class="cockpit-full-row-two">
    <GmvHourlyChartCard :option="hourlyOption" :date-label="hourlyDateLabel" />

    <GmvCockpitChartCard
      title="区域/商圈分布（GMV）"
      :option="distributionOption"
      :model-value="distDim"
      :options="GMV_DIST_OPTIONS"
      :truncated="distributionTruncated"
      :limit="distributionLimit"
      :matched="distributionMatched"
      @change="
        (v) => {
          distDim = String(v) as 'area' | 'category';
          $emit('dist-change');
        }
      "
    />
  </div>

  <!-- Secondary analysis row: category donut, channel bars, funnel and alerts. -->
  <div class="cockpit-secondary-grid">
    <div class="grid-col grid-col-middle">
      <GmvCategoryDonut :rows="categories" :total="totalGmvDisplay" />

      <GmvChannelBars :rows="channels" />
    </div>

    <div class="grid-col grid-col-right">
      <GmvConversionFunnel :stages="funnel" />

      <GmvAlertsList :alerts="alerts" />

      <!-- Hidden / collapsed sections kept for data flow compatibility -->
      <div style="display: none">
        <GmvActivityTable :rows="activities" />
        <GmvHeatmap :city="heatCity" :points="heatPoints" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.cockpit-grid {
  display: none;
}

.cockpit-primary-row {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(360px, 1fr);
  gap: 12px;
  align-items: stretch;
  min-width: 0;
}

.cockpit-primary-row > * {
  min-width: 0;
}

.cockpit-secondary-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
}

.grid-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.cockpit-full-row-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
  width: 100%;
}

/* Responsive breakpoints */
@media (max-width: 1400px) {
  .cockpit-primary-row {
    grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
  }
}

@media (max-width: 1180px) {
  .cockpit-primary-row,
  .cockpit-secondary-grid,
  .cockpit-full-row-two {
    grid-template-columns: 1fr;
  }
}
</style>
