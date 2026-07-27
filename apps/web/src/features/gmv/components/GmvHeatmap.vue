<template>
  <section class="panel chart-card gmv-heatmap-card">
    <header class="gmv-heatmap-header">
      <h3>热力表现</h3>
      <el-select :model-value="city" size="small" class="gmv-heatmap-city" disabled>
        <el-option :label="city" :value="city" />
      </el-select>
    </header>
    <EmptyState
      v-if="cells.length === 0"
      title="暂无区域热力数据"
      description="区域 GMV 分布数据将在订单同步后自动生成"
    />
    <div v-else class="gmv-heatmap-body">
      <div class="gmv-heatmap-canvas">
        <div class="gmv-heatmap-grid" :style="gridStyle">
          <span
            v-for="cell in cells"
            :key="cell.key"
            class="gmv-heatmap-cell"
            :style="{ background: cell.color }"
            :title="cell.title"
          />
        </div>
        <div class="gmv-heatmap-overlay" aria-hidden="true" />
      </div>
      <div class="gmv-heatmap-legend">
        <span class="legend-label">低</span>
        <div class="legend-gradient" />
        <span class="legend-label">高</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EmptyState from '../../../components/EmptyState.vue';

type HeatPoint = {
  name: string;
  value: [number, number, number];
};

const props = defineProps<{
  city: string;
  points: HeatPoint[];
}>();

// Map an intensity 0..1 to the design's gradient stops.
function intensityColor(intensity: number) {
  const clamped = Math.min(1, Math.max(0, intensity));
  if (clamped < 0.25) return `rgba(22, 183, 158, ${0.35 + clamped})`;
  if (clamped < 0.5) return `rgba(253, 230, 138, ${0.55 + clamped})`;
  if (clamped < 0.75) return `rgba(247, 144, 9, ${0.55 + clamped})`;
  return `rgba(240, 68, 56, ${0.55 + clamped * 0.45})`;
}

const cells = computed(() => {
  if (props.points.length === 0) return [];
  return props.points.map((p) => ({
    key: `${p.value[0]}-${p.value[1]}-${p.name}`,
    col: p.value[0],
    row: p.value[1],
    intensity: p.value[2],
    color: intensityColor(p.value[2]),
    title: `${p.name} · 热度 ${Math.round(p.value[2] * 100)}`
  }));
});

const gridStyle = computed(() => {
  const cols = Math.max(...props.points.map((p) => p.value[0]), 0) + 1;
  const rows = Math.max(...props.points.map((p) => p.value[1]), 0) + 1;
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
  };
});
</script>

<style scoped>
.gmv-heatmap-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.gmv-heatmap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.gmv-heatmap-header h3 {
  margin: 0;
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.gmv-heatmap-city {
  width: 110px;
}

.gmv-heatmap-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.gmv-heatmap-canvas {
  position: relative;
  height: 200px;
  border-radius: 12px;
  background:
    radial-gradient(circle at 30% 25%, rgba(46, 144, 250, 0.06), transparent 55%),
    radial-gradient(circle at 80% 70%, rgba(158, 119, 237, 0.06), transparent 50%), #f8fafc;
  overflow: hidden;
  border: 1px solid #eef0f3;
}

.gmv-heatmap-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(transparent 95%, rgba(15, 23, 42, 0.04) 95%),
    linear-gradient(90deg, transparent 95%, rgba(15, 23, 42, 0.04) 95%);
  background-size: 24px 24px;
  pointer-events: none;
  opacity: 0.7;
}

.gmv-heatmap-grid {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 22px 18px;
  width: 100%;
  height: 100%;
  z-index: 1;
  justify-items: center;
  align-items: center;
}

.gmv-heatmap-cell {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
  transition: transform 120ms;
}

.gmv-heatmap-cell:hover {
  transform: scale(1.08);
}

.gmv-heatmap-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
  color: #667085;
  font-size: 12px;
}

.legend-label {
  font-weight: 600;
}

.legend-gradient {
  width: 96px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(to right, #16b79e, #fde68a, #f79009, #f04438);
}
</style>
