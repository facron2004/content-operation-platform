import { defineAsyncComponent } from 'vue';
import type { EChartsOption } from 'echarts';
import type { GmvTrendGranularity, GmvTrendMode } from '../composables/gmv-chart-ui';
import type { GmvMerchantRow } from '../../../services/api/gmv.api';

export const GMV_TREND_GRANULARITY_OPTIONS = [
  { label: '按日', value: 'day' as const },
  { label: '按周', value: 'week' as const },
  { label: '按月', value: 'month' as const }
];

export const GMV_DIST_OPTIONS = [
  { label: '区域', value: 'area' },
  { label: '品类', value: 'category' }
];

export type GmvChartProps = {
  trendGranularity: GmvTrendGranularity;
  trendMode: GmvTrendMode;
  trendOption: EChartsOption | Record<string, unknown>;
};

export const GmvChartPanel = defineAsyncComponent(
  () => import('../../../components/ChartPanel.vue')
);

export type GmvChartsEmit = {
  (e: 'update:trendGranularity', value: 'day' | 'week' | 'month'): void;
  (e: 'update:trendMode', value: 'volume' | 'rates' | 'mix'): void;
  (e: 'trendChange'): void;
};

export function createGmvChartsHandlers(emit: GmvChartsEmit) {
  type V = string | number | boolean | undefined;
  return {
    onGranularityChange: (v: V) => {
      emit('update:trendGranularity', String(v) as 'day' | 'week' | 'month');
      emit('trendChange');
    },
    onModeChange: (v: V) => {
      emit('update:trendMode', String(v) as 'volume' | 'rates' | 'mix');
    }
  };
}

export type GmvTopMerchant = GmvMerchantRow;
