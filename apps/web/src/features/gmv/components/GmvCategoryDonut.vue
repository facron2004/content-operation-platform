<template>
  <section class="panel chart-card gmv-category-card">
    <header class="gmv-category-header">
      <h3>品类GMV占比</h3>
      <span class="gmv-category-meta">{{ rows.length }} 个品类</span>
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
        <li v-for="row in rows" :key="row.name" class="gmv-category-legend-item">
          <span class="legend-swatch" :style="{ background: row.color }" />
          <span class="legend-name">{{ row.name }}</span>
          <span class="legend-share">{{ formatPercentRaw(row.share * 100) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { defineAsyncComponent } from 'vue';
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

// 优先用品类行求和（与图例一致）；无数据时回退外部 total
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
        radius: ['62%', '86%'],
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
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.gmv-category-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
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

.gmv-category-body {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.gmv-category-donut {
  position: relative;
  min-height: 200px;
  display: grid;
  place-items: center;
}

.gmv-category-donut-panel :deep(.chart-shell) {
  height: 200px;
  min-height: 200px;
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
  font-size: 12px;
}

.gmv-category-center-value {
  color: #101828;
  font-size: 18px;
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
  gap: 8px;
  min-width: 0;
}

.gmv-category-legend-item {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  align-items: center;
  gap: 8px;
  color: #475467;
  font-size: 13px;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.legend-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-share {
  color: #101828;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1280px) {
  .gmv-category-body {
    grid-template-columns: 1fr;
  }
}
</style>
