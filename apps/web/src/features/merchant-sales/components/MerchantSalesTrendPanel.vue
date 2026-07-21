<template>
  <section class="panel chart-card">
    <header>
      <h3>{{ windowLabel }} GMV / 退款 / 核销 趋势</h3>
    </header>
    <ChartPanel :option="trendOption" />
  </section>
</template>
<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
defineProps<{ windowLabel: string; trendOption: Record<string, unknown> }>();
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
</script>
