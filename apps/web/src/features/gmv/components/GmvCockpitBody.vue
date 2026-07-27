<script setup lang="ts">
import GmvKpiRow from './GmvKpiRow.vue';
import GmvCockpitCharts from './GmvCockpitCharts.vue';
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

import type { GmvKpi } from '../../../services/api/gmv.api';
import type { GmvTopMerchant } from './gmv-cockpit-charts-ui';
import type {
  GmvActivityRow,
  GmvAlertItem,
  GmvCategoryRow,
  GmvChannelRow,
  GmvFunnelStage,
  GmvHeatPoint
} from '../composables/gmv-cockpit-core';

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
};

defineProps<GmvCockpitBodyProps>();

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
</script>

<template>
  <GmvKpiRow :kpi="kpi" />

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

  <div class="chart-row chart-row-secondary">
    <GmvCockpitChartCard
      title="GMV 区域分布"
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

  <div class="chart-row chart-row-tertiary">
    <GmvCategoryDonut :rows="categories" :total="totalGmvDisplay" />
    <GmvChannelBars :rows="channels" />
    <GmvConversionFunnel :stages="funnel" />
  </div>

  <div class="chart-row chart-row-quaternary">
    <GmvActivityTable :rows="activities" />
    <GmvHeatmap :city="heatCity" :points="heatPoints" />
    <GmvAlertsList :alerts="alerts" />
  </div>
</template>
