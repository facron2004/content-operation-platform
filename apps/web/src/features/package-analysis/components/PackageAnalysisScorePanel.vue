<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core';
import ChartPanel from '../../../components/ChartPanel.vue';
defineProps<{ option: EChartsCoreOption }>();
</script>
<template>
  <section class="panel">
    <div class="panel-head"><h2>评分拆解</h2></div>
    <ChartPanel :option="option" />
  </section>
</template>
