import { defineAsyncComponent } from 'vue';
import type { EChartsOption } from 'echarts';
import type { GmvTrendGranularity, GmvTrendMode } from '../composables/gmv-chart-ui';

export const GMV_TREND_GRANULARITY_OPTIONS = [
  { label: '按日', value: 'day' as const },
  { label: '按周', value: 'week' as const },
  { label: '按月', value: 'month' as const }
];

export const GMV_TREND_MODE_OPTIONS = [
  { label: 'GMV·成单', value: 'volume' as const },
  { label: '退款·核销率', value: 'rates' as const },
  { label: '在线·余额', value: 'mix' as const }
];

export const GMV_DIST_OPTIONS = [
  { label: '区域', value: 'area' },
  { label: '品类', value: 'category' }
];

export type GmvChartProps = {
  trendGranularity: GmvTrendGranularity;
  trendMode: GmvTrendMode;
  distDim: 'area' | 'category';
  trendOption: EChartsOption | Record<string, unknown>;
  hourlyOption: EChartsOption | Record<string, unknown>;
  distributionOption: EChartsOption | Record<string, unknown>;
  hourlyDateLabel?: string;
};

export const GmvChartPanel = defineAsyncComponent(
  () => import('../../../components/ChartPanel.vue')
);

export type GmvChartsEmit = {
  (e: 'update:trendGranularity', value: 'day' | 'week' | 'month'): void;
  (e: 'update:trendMode', value: 'volume' | 'rates' | 'mix'): void;
  (e: 'update:distDim', value: 'area' | 'category'): void;
  (e: 'trendChange'): void;
  (e: 'distChange'): void;
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
    },
    onDistChange: (v: V) => {
      emit('update:distDim', String(v) as 'area' | 'category');
      emit('distChange');
    }
  };
}

export type GmvTopMerchant = {
  merchantName: string;
  areaName?: string | null;
  gmv: number;
  gmvRefund: number;
  gmvVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
};
