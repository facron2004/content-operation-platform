<template><div ref="el" class="chart-panel chart-shell" /></template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { bindChartPanel, type ChartClickPayload } from './chart-panel-runtime';
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);
const props = defineProps<{ option: EChartsCoreOption }>(),
  emit = defineEmits<{ click: [payload: ChartClickPayload] }>(),
  el = ref<HTMLDivElement | null>(null);
const { dispose } = bindChartPanel(
  el,
  () => props.option,
  (payload) => emit('click', payload)
);
watch(
  () => props.option,
  (cur, pre) => {
    if (cur !== pre) dispose.render();
  }
);
onMounted(dispose.mount);
onBeforeUnmount(dispose.unmount);
</script>
<style src="./chart-panel.css" scoped></style>
