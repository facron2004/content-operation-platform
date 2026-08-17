<template>
  <section class="dashboard-panel dashboard-trend-panel">
    <div class="dashboard-panel__header">
      <div>
        <div class="dashboard-section-label">03 / MOMENTUM</div>
        <h2>GMV &amp; 订单趋势</h2>
        <p>用趋势变化定位今天最值得关注的经营时段。</p>
      </div>
      <div class="dashboard-segment" role="tablist" aria-label="趋势指标">
        <button
          v-for="item in metricOptions"
          :key="item.value"
          type="button"
          :class="{ 'is-active': metric === item.value }"
          role="tab"
          :aria-selected="metric === item.value"
          @click="$emit('update:metric', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div class="dashboard-trend-panel__meta">
      <div class="dashboard-chart-legend">
        <span class="dashboard-chart-legend__item">
          <i class="is-blue" />
          {{ activeMetricLabel }}
        </span>
        <span class="dashboard-chart-legend__item">
          <i class="is-teal" />
          订单量
        </span>
        <span v-if="showCompare" class="dashboard-chart-legend__item">
          <i class="is-dashed" />
          昨日
        </span>
      </div>
      <span class="dashboard-trend-panel__caption">
        {{ rangeLabel }} · {{ points.length }} 个观测点
      </span>
    </div>
    <ChartPanel :option="option" class="dashboard-trend-chart" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import ChartPanel from '../../../components/ChartPanel.vue';
import {
  TIME_RANGE_OPTIONS,
  type DashboardTimeRange,
  type DashboardTrendMetric,
  type DashboardTrendPoint
} from '../operations-dashboard';

const props = defineProps<{
  points: DashboardTrendPoint[];
  option: EChartsCoreOption;
  metric: DashboardTrendMetric;
  timeRange: DashboardTimeRange;
}>();

defineEmits<{
  'update:metric': [value: DashboardTrendMetric];
}>();

const metricOptions: Array<{ label: string; value: DashboardTrendMetric }> = [
  { label: 'GMV', value: 'gmv' },
  { label: '支付订单', value: 'orders' },
  { label: '核销订单', value: 'verify' },
  { label: '退款金额', value: 'refund' }
];

const activeMetricLabel = computed(
  () => metricOptions.find((item) => item.value === props.metric)?.label ?? 'GMV'
);
const rangeLabel = computed(
  () => TIME_RANGE_OPTIONS.find((item) => item.value === props.timeRange)?.label ?? '今日'
);
const showCompare = computed(() => props.metric === 'gmv' && props.points.length <= 12);
</script>

<style scoped>
.dashboard-trend-panel {
  padding: 18px 20px 14px;
}

.dashboard-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.dashboard-section-label {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.dashboard-panel h2 {
  margin: 7px 0 0;
  color: #1d2b3f;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.025em;
}

.dashboard-panel__header p {
  margin: 5px 0 0;
  color: #8a97a8;
  font-size: 11px;
}

.dashboard-segment {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f7f9fc;
}

.dashboard-segment button {
  min-height: 25px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #8090a4;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  transition: 160ms ease;
}

.dashboard-segment button:hover,
.dashboard-segment button.is-active {
  background: #fff;
  color: #246fc6;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.12);
}

.dashboard-trend-panel__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
}

.dashboard-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.dashboard-chart-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #718096;
  font-size: 11px;
}

.dashboard-chart-legend__item i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dashboard-chart-legend__item i.is-blue {
  background: #3b82f6;
}

.dashboard-chart-legend__item i.is-teal {
  background: #14b8a6;
}

.dashboard-chart-legend__item i.is-dashed {
  width: 14px;
  height: 0;
  border-top: 1px dashed #a8b1c0;
  border-radius: 0;
}

.dashboard-trend-panel__caption {
  color: #9aa6b5;
  font-size: 11px;
}

.dashboard-trend-chart :deep(.chart-shell) {
  height: 258px;
  min-height: 258px;
  margin-top: 2px;
}

@media (max-width: 760px) {
  .dashboard-panel__header,
  .dashboard-trend-panel__meta {
    align-items: flex-start;
    flex-direction: column;
  }

  .dashboard-segment {
    width: 100%;
    overflow-x: auto;
  }

  .dashboard-segment button {
    flex: 1 0 auto;
  }
}
</style>
