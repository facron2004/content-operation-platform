<template>
  <section class="panel chart-card">
    <header>
      <h3>{{ title }}</h3>
      <slot name="controls" />
    </header>
    <ChartPanel :option="option" />
  </section>
</template>
<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
defineProps<{ title: string; option: Record<string, unknown> }>();
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
</script>
