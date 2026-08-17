<template>
  <section class="dashboard-panel dashboard-composition-card">
    <div class="dashboard-panel__header dashboard-panel__header--compact">
      <div>
        <div class="dashboard-section-label">04 / MIX</div>
        <h2>GMV 业务构成</h2>
        <p>从区域、商品类型和渠道看清 GMV 来自哪里。</p>
      </div>
      <span class="dashboard-panel__badge">总计 {{ formatMoney(total) }}</span>
    </div>
    <div class="dashboard-tab-row" role="tablist" aria-label="GMV构成维度">
      <button
        v-for="item in tabs"
        :key="item.value"
        type="button"
        :class="{ 'is-active': tab === item.value }"
        role="tab"
        :aria-selected="tab === item.value"
        @click="$emit('update:tab', item.value)"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="dashboard-composition__body">
      <div class="dashboard-donut">
        <ChartPanel :option="donutOption" class="dashboard-donut__chart" />
        <div class="dashboard-donut__center">
          <span>GMV</span>
          <strong>{{ compactMoney(total) }}</strong>
        </div>
      </div>
      <div class="dashboard-composition__list">
        <div v-for="item in items" :key="item.label" class="dashboard-composition__item">
          <div class="dashboard-composition__name">
            <i :style="{ background: item.color }" />
            <span>{{ item.label }}</span>
          </div>
          <strong>{{ formatMoney(item.value) }}</strong>
          <span>{{ item.share }}%</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import ChartPanel from '../../../components/ChartPanel.vue';
import type { DashboardBreakdownItem, DashboardCompositionTab } from '../operations-dashboard';

const props = defineProps<{
  tab: DashboardCompositionTab;
  items: DashboardBreakdownItem[];
  total: number;
}>();

defineEmits<{ 'update:tab': [value: DashboardCompositionTab] }>();

const tabs: Array<{ label: string; value: DashboardCompositionTab }> = [
  { label: '区域', value: 'region' },
  { label: '商品类型', value: 'category' },
  { label: '渠道', value: 'channel' }
];

const donutOption = computed<EChartsCoreOption>(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (params: { name: string; value: number; data: { share: number } }) =>
      `${params.name}<br/>GMV：¥${Math.round(params.value).toLocaleString('zh-CN')}<br/>占比：${params.data.share}%`
  },
  series: [
    {
      type: 'pie',
      radius: ['60%', '84%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 3 },
      data: props.items.map((item) => ({
        name: item.label,
        value: item.value,
        share: item.share,
        itemStyle: { color: item.color }
      }))
    }
  ]
}));

const formatMoney = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`;
const compactMoney = (value: number) =>
  value >= 10000 ? `¥${(value / 10000).toFixed(1)}万` : formatMoney(value);
const total = computed(() => props.items.reduce((sum, item) => sum + item.value, 0) || props.total);
</script>

<style scoped>
.dashboard-composition-card {
  padding: 18px 20px 16px;
}

.dashboard-panel__header--compact {
  margin-bottom: 14px;
}

.dashboard-panel__badge {
  padding: 5px 8px;
  border-radius: 7px;
  background: #f5f8fc;
  color: #74849a;
  font-family: var(--font-numeric);
  font-size: 10px;
  white-space: nowrap;
}

.dashboard-tab-row {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: #f5f7fa;
}

.dashboard-tab-row button {
  min-height: 25px;
  padding: 0 11px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8794a5;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.dashboard-tab-row button.is-active,
.dashboard-tab-row button:hover {
  background: #fff;
  color: #2772cc;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.1);
}

.dashboard-composition__body {
  display: grid;
  grid-template-columns: minmax(150px, 0.85fr) minmax(0, 1.15fr);
  gap: 16px;
  align-items: center;
  margin-top: 16px;
}

.dashboard-donut {
  position: relative;
  min-height: 188px;
}

.dashboard-donut__chart :deep(.chart-shell) {
  height: 188px;
  min-height: 188px;
}

.dashboard-donut__center {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  pointer-events: none;
}

.dashboard-donut__center span {
  color: #94a3b8;
  font-size: 10px;
}

.dashboard-donut__center strong {
  margin-top: 5px;
  color: #203149;
  font-family: var(--font-numeric);
  font-size: 16px;
}

.dashboard-composition__list {
  display: grid;
  gap: 9px;
}

.dashboard-composition__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 36px;
  align-items: center;
  gap: 7px;
  color: #718096;
  font-size: 11px;
}

.dashboard-composition__name {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.dashboard-composition__name i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 2px;
}

.dashboard-composition__name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-composition__item strong {
  color: #27384e;
  font-family: var(--font-numeric);
  font-size: 11px;
}

.dashboard-composition__item > span {
  color: #8d9aac;
  font-family: var(--font-numeric);
  text-align: right;
}

@media (max-width: 560px) {
  .dashboard-composition__body {
    grid-template-columns: 1fr;
  }
}
</style>
