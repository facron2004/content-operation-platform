<template>
  <div class="chart-row chart-row-main">
    <section class="panel chart-card chart-card-wide proto-chart-card">
      <header class="proto-chart-header">
        <h3>GMV趋势</h3>
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
      </header>
      <div class="proto-chart-legend">
        <span class="legend-dot legend-gmv" />
        GMV（元）
      </div>
      <ChartPanel :option="trendOption" class="proto-chart-panel" />
    </section>

    <section class="panel chart-card proto-chart-card">
      <header class="proto-chart-header">
        <h3>分时段成交趋势</h3>
        <el-select
          :model-value="hourlyDateLabel || '今天'"
          size="small"
          class="proto-hour-select"
          disabled
        >
          <el-option :label="hourlyDateLabel || '今天'" :value="hourlyDateLabel || '今天'" />
        </el-select>
      </header>
      <div class="proto-chart-legend">
        <span class="legend-dot legend-gmv" />
        GMV（元）
      </div>
      <ChartPanel :option="hourlyOption" class="proto-chart-panel" />
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  createGmvChartsHandlers,
  GmvChartPanel as ChartPanel,
  GMV_TREND_GRANULARITY_OPTIONS,
  type GmvChartProps
} from './gmv-cockpit-charts-ui';

defineProps<GmvChartProps>();
const emit = defineEmits<{
  'update:trendGranularity': [value: 'day' | 'week' | 'month'];
  'update:trendMode': [value: 'volume' | 'rates' | 'mix'];
  'update:distDim': [value: 'area' | 'category'];
  trendChange: [];
  distChange: [];
}>();
const { onGranularityChange } = createGmvChartsHandlers(emit);
</script>

<style scoped>
.proto-chart-card {
  padding: 16px 16px 12px;
  border: 1px solid #e4e7ec;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.proto-chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.proto-chart-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}
.proto-hour-select {
  width: 96px;
}
.proto-chart-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #667085;
  font-size: 12px;
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
.proto-chart-panel :deep(.chart-shell) {
  height: 280px;
  min-height: 280px;
}
.chart-row-main {
  display: grid;
  grid-template-columns: 1.45fr 1fr;
  gap: 12px;
}
@media (max-width: 1280px) {
  .chart-row-main {
    grid-template-columns: 1fr;
  }
}
</style>
