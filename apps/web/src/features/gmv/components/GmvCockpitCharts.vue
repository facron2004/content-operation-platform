<template>
  <div class="chart-row chart-row-main">
    <section class="panel chart-card chart-card-wide proto-chart-card">
      <header class="proto-chart-header">
        <h3>GMV趋势</h3>
        <div class="chart-controls">
          <el-radio-group
            :model-value="trendGranularity"
            size="small"
            class="proto-segment"
            @change="onGranularityChange"
          >
            <el-radio-button
              v-for="opt in GMV_TREND_GRANULARITY_OPTIONS"
              :key="String(opt.value)"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
          <el-radio-group
            :model-value="trendMode"
            size="small"
            class="proto-segment proto-segment-sm"
            @change="onModeChange"
          >
            <el-radio-button value="volume">对比</el-radio-button>
            <el-radio-button value="rates">环比</el-radio-button>
          </el-radio-group>
        </div>
      </header>
      <div class="proto-chart-legend">
        <span class="legend-dot legend-gmv" />
        GMV（元）
        <span v-if="latestPoint" class="legend-latest">
          {{ latestDate }} ·
          <strong>GMV ¥{{ formatNumber(latestPoint) }}</strong>
        </span>
      </div>
      <ChartPanel :option="trendOption" class="proto-chart-panel" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  createGmvChartsHandlers,
  GmvChartPanel as ChartPanel,
  GMV_TREND_GRANULARITY_OPTIONS,
  type GmvChartProps
} from './gmv-cockpit-charts-ui';
import { formatNumber } from '../../../utils/format';

const props = defineProps<GmvChartProps>();

const emit = defineEmits<{
  'update:trendGranularity': [value: 'day' | 'week' | 'month'];
  'update:trendMode': [value: 'volume' | 'rates' | 'mix'];
  'update:distDim': [value: 'area' | 'category'];
  trendChange: [];
  distChange: [];
}>();

const { onGranularityChange, onModeChange } = createGmvChartsHandlers(emit);

/** Extract latest data point for legend display */
const latestPoint = computed(() => {
  const opt = props.trendOption as Record<string, unknown>;
  const series = (opt?.series as Array<Record<string, unknown>>)?.[0];
  const data = series?.data as Array<unknown>;
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const last = data[data.length - 1];
  if (Array.isArray(last)) return (last[1] as number) ?? null;
  if (typeof last === 'object' && last !== null)
    return ((last as Record<string, unknown>).value as number) ?? null;
  return (last as number) ?? null;
});

const latestDate = computed(() => {
  const opt = props.trendOption as Record<string, unknown>;
  const xData = (opt?.xAxis as Record<string, unknown>)?.data as string[];
  if (!xData || !Array.isArray(xData) || xData.length === 0) return '';
  return xData[xData.length - 1] || '';
});
</script>

<style scoped>
.proto-chart-card {
  padding: 14px 14px 10px;
  border: 1px solid #e4e7ec;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  height: 100%;
}

.proto-chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.proto-chart-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.chart-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.proto-segment :deep(.el-radio-button__inner) {
  padding: 6px 12px;
  border-radius: 8px !important;
}

.proto-segment-sm :deep(.el-radio-button__inner) {
  padding: 5px 10px;
  font-size: 12px;
}

.proto-hour-select {
  width: 96px;
}

.proto-chart-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #667085;
  font-size: 12px;
  flex-wrap: wrap;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}

.legend-gmv {
  background: #2e90fa;
}

.legend-orders {
  background: #9e77ed;
}

.legend-latest {
  margin-left: auto;
  color: #667085;
}
.legend-latest strong {
  color: #101828;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.proto-chart-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.proto-chart-panel :deep(.chart-shell) {
  flex: 1;
  min-height: 220px;
  height: 100%;
}

.chart-row-main {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  height: 100%;
}

@media (max-width: 1280px) {
  .chart-row-main {
    grid-template-columns: 1fr;
  }
}
</style>
