<template>
  <section class="panel chart-card proto-chart-card">
    <header class="proto-chart-header">
      <h3>分时段成交趋势</h3>
      <el-select :model-value="dateLabel || '今天'" size="small" class="proto-hour-select" disabled>
        <el-option :label="dateLabel || '今天'" :value="dateLabel || '今天'" />
      </el-select>
    </header>
    <div class="proto-chart-legend">
      <span class="legend-dot legend-gmv" />
      GMV（元）
      <span class="legend-dot legend-orders" />
      订单（单）
    </div>
    <ChartPanel :option="option" class="proto-chart-panel" />
  </section>
</template>

<script setup lang="ts">
import type { EChartsOption } from 'echarts';
import { GmvChartPanel as ChartPanel } from './gmv-cockpit-charts-ui';

defineProps<{
  option: EChartsOption | Record<string, unknown>;
  dateLabel?: string;
}>();
</script>

<style scoped>
.proto-chart-card {
  padding: 20px 20px 16px;
  border: 1px solid #e4e7ec;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  gap: 14px;
  color: #667085;
  font-size: 12px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
  background: #2e90fa;
}

.legend-orders {
  background: #9e77ed;
}

.proto-chart-panel :deep(.chart-shell) {
  height: 220px;
  min-height: 220px;
}
</style>
