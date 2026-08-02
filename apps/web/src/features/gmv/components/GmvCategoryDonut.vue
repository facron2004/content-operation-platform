<template>
  <section class="panel chart-card gmv-category-card">
    <header class="gmv-category-header">
      <h3>交易结构（按品类）</h3>
      <span class="gmv-category-meta">{{ rows.length }} 个品类</span>
      <a class="gmv-category-more" href="javascript:void(0)">查看全部 ›</a>
    </header>
    <EmptyState
      v-if="rows.length === 0"
      title="暂无品类数据"
      description="下拉刷新 JeeSite 订单或使用历史回填同步数据"
    />
    <div v-else class="gmv-category-body">
      <div class="gmv-category-donut">
        <ChartPanel :option="donutOption" class="gmv-category-donut-panel" />
        <div class="gmv-category-center">
          <span class="gmv-category-center-label">总GMV</span>
          <strong class="gmv-category-center-value">¥ {{ totalText }}</strong>
        </div>
      </div>
      <ul class="gmv-category-legend">
        <li class="legend-head">
          <span>品类</span>
          <span class="align-right">GMV（元）</span>
          <span class="align-right">占比</span>
        </li>
        <li v-for="row in rows" :key="row.name" class="gmv-category-legend-item">
          <span class="legend-name-row">
            <span class="legend-swatch" :style="{ background: row.color }" />
            <span class="legend-name">{{ row.name }}</span>
          </span>
          <span class="legend-value align-right">{{ '¥ ' + formatNumber(row.value) }}</span>
          <span class="legend-share align-right">{{ formatPercentRaw(row.share * 100) }}</span>
        </li>
        <li v-if="rows.length > 0" class="gmv-category-legend-item legend-total">
          <span class="legend-name-row">
            <span class="legend-name font-bold">合计</span>
          </span>
          <span class="legend-value align-right font-bold">{{ '¥ ' + totalText }}</span>
          <span class="legend-share align-right font-bold">100%</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { formatNumber, formatPercentRaw } from '../../../utils/format';
import EmptyState from '../../../components/EmptyState.vue';

const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));

type CategoryRow = {
  name: string;
  value: number;
  share: number;
  color: string;
};

const props = defineProps<{
  rows: CategoryRow[];
  total: number;
}>();

const totalText = computed(() => {
  const sum = props.rows.reduce((s, r) => s + Number(r.value || 0), 0);
  return formatNumber(sum > 0 ? sum : props.total);
});

const palette = ['#2e90fa', '#16b79e', '#9e77ed', '#f79009', '#6172f3', '#0ba5ec'];

const donutOption = computed(() => {
  const data = props.rows.map((row, idx) => ({
    name: row.name,
    value: Number(row.value.toFixed(2)),
    itemStyle: { color: row.color || palette[idx % palette.length] }
  }));
  if (data.length === 0) return {};
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>GMV: ¥ ${formatNumber(p.value)}<br/>占比: ${p.percent.toFixed(1)}%`
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '84%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2
        },
        label: { show: false },
        labelLine: { show: false },
        data
      }
    ]
  };
});
</script>

<style scoped>
.gmv-category-card {
  padding: 18px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.gmv-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.gmv-category-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.gmv-category-meta {
  color: #98a2b3;
  font-size: 12px;
}

.gmv-category-more {
  color: #667085;
  font-size: 12px;
  text-decoration: none;
  margin-left: auto;
}
.gmv-category-more:hover {
  color: #2e90fa;
}

.gmv-category-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 16px;
  align-items: center;
}

.gmv-category-donut {
  position: relative;
  min-height: 180px;
  display: grid;
  place-items: center;
}

.gmv-category-donut-panel :deep(.chart-shell) {
  height: 180px;
  min-height: 180px;
}

.gmv-category-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-align: center;
}

.gmv-category-center-label {
  color: #98a2b3;
  font-size: 11px;
}

.gmv-category-center-value {
  color: #101828;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.gmv-category-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.legend-head {
  display: grid;
  grid-template-columns: 1.3fr 1fr 0.7fr;
  gap: 8px;
  color: #98a2b3;
  font-size: 11px;
  font-weight: 600;
  padding: 0 2px 4px;
  border-bottom: 1px solid #f0f1f3;
}

.gmv-category-legend-item {
  display: grid;
  grid-template-columns: 1.3fr 1fr 0.7fr;
  gap: 8px;
  align-items: center;
  color: #475467;
  font-size: 12px;
  padding: 4px 0;
}

.legend-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.legend-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
  flex-shrink: 0;
}

.legend-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-value,
.legend-share {
  font-variant-numeric: tabular-nums;
  color: #101828;
  font-weight: 500;
}

.align-right {
  text-align: right;
}

.font-bold {
  font-weight: 700;
}

.legend-total {
  border-top: 1px dashed #e4e7ec;
  padding-top: 6px;
  margin-top: 2px;
}

@media (max-width: 1100px) {
  .gmv-category-body {
    grid-template-columns: 1fr;
  }
}
</style>
