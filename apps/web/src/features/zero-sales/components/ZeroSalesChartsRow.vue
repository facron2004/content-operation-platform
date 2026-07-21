<template>
  <div class="chart-row">
    <section class="panel chart-card">
      <header>
        <h3>零动销阶梯分布</h3>
        <span class="scope-note">点击柱体切换下方阶梯筛选</span>
      </header>
      <ChartPanel :option="staleOption" @click="onStaleClick" />
    </section>
    <section class="panel chart-card">
      <header>
        <h3>零动销分布</h3>
        <el-radio-group :model-value="dim" size="small" @change="onDimChange">
          <el-radio-button value="area">区域</el-radio-button>
          <el-radio-button value="category">品类</el-radio-button>
        </el-radio-group>
      </header>
      <ChartPanel :option="dimOption" />
    </section>
  </div>
</template>
<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import type { EChartsOption } from 'echarts';
import type { ChartClickPayload } from '../../../components/chart-panel-runtime';
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
defineProps<{
  staleOption: EChartsOption | Record<string, unknown>;
  dimOption: EChartsOption | Record<string, unknown>;
  dim: 'area' | 'category';
}>();
const emit = defineEmits<{
  'update:dim': [value: 'area' | 'category'];
  'dim-change': [value: 'area' | 'category'];
  'stale-click': [key: string];
}>();
function onDimChange(v: string | number | boolean | undefined) {
  const next = String(v) as 'area' | 'category';
  emit('update:dim', next);
  emit('dim-change', next);
}
function onStaleClick(p: ChartClickPayload) {
  const k = p.data?.key;
  if (typeof k === 'string' && k) emit('stale-click', k);
}
</script>
