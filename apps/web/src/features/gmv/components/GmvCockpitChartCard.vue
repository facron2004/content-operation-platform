<template>
  <section class="panel chart-card">
    <header>
      <h3>{{ title }}</h3>
      <el-radio-group :model-value="modelValue" size="small" @change="$emit('change', $event)">
        <el-radio-button v-for="opt in options" :key="String(opt.value)" :value="opt.value">
          {{ opt.label }}
        </el-radio-button>
      </el-radio-group>
    </header>
    <ChartPanel :option="option" />
  </section>
</template>
<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import type { EChartsOption } from 'echarts';
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
defineProps<{
  title: string;
  modelValue: string | number;
  options: Array<{ label: string; value: string | number }>;
  option: EChartsOption | Record<string, unknown>;
}>();
defineEmits<{ change: [value: string | number | boolean | undefined] }>();
</script>
