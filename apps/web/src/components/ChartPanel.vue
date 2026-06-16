<template>
  <div ref="el" class="chart-panel" />
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

const render = () => {
  if (!el.value) return;
  if (!chart) chart = echarts.init(el.value);
  chart.setOption(props.option, true);
};

// resize 时仅调整尺寸，不重新渲染全部 option（比 setOption 快很多）
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
const handleResize = () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    chart?.resize();
  }, 100);
};

onMounted(() => {
  render();
  window.addEventListener('resize', handleResize);
});

// 仅监听 option 变化时重新渲染（浅比较顶层 key，避免 deep watch 的性能开销）
watch(
  () => props.option,
  (cur, pre) => {
    // 快速浅比较：如果引用相同则跳过
    if (cur === pre) return;
    // 如果 series data 或关键配置变化则重新渲染
    render();
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (resizeTimer) clearTimeout(resizeTimer);
  chart?.dispose();
  chart = null;
});
</script>
