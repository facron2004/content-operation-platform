<template>
  <div ref="el" class="chart-panel chart-shell" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

const props = defineProps<{ option: EChartsCoreOption }>();
const el = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;

const render = () => {
  if (!el.value) return;
  if (!chart) chart = echarts.init(el.value);
  chart.setOption(props.option, true);
};

const scheduleResize = () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    chart?.resize();
  }, 80);
};

onMounted(() => {
  render();

  resizeObserver = new ResizeObserver(() => {
    scheduleResize();
  });

  if (el.value) {
    resizeObserver.observe(el.value);
  }

  window.addEventListener('resize', scheduleResize);
});

watch(
  () => props.option,
  (cur, pre) => {
    if (cur === pre) return;
    render();
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (resizeTimer) clearTimeout(resizeTimer);
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.chart-shell {
  width: 100%;
  height: 100%;
  min-height: 320px;
}
</style>
