<template>
  <section class="panel chart-card">
    <header>
      <h3>{{ titleLabel }}</h3>
      <el-radio-group :model-value="modelValue" size="small" @change="$emit('change', $event)">
        <el-radio-button v-for="opt in options" :key="String(opt.value)" :value="opt.value">
          {{ opt.label }}
        </el-radio-button>
      </el-radio-group>
    </header>
    <!-- Residual #289: distribution Top-N honesty banner. -->
    <p v-if="truncated" class="list-cap-hint">
      仅展示 GMV 最高的前 {{ limitLabel }} 个分桶（至少匹配 {{ matchedLabel }}
      个），「其他」为长尾合计；图表占比按全平台 GMV 计算。
    </p>
    <ChartPanel :option="option" />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { EChartsOption } from 'echarts';
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
const props = withDefaults(
  defineProps<{
    title: string;
    modelValue: string | number;
    options: Array<{ label: string; value: string | number }>;
    option: EChartsOption | Record<string, unknown>;
    // Residual #289: optional Top-N honesty for distribution chart.
    truncated?: boolean;
    limit?: number | null;
    matched?: number | null;
  }>(),
  {
    truncated: false,
    limit: null,
    matched: null
  }
);
defineEmits<{ change: [value: string | number | boolean | undefined] }>();
const limitLabel = computed(() =>
  typeof props.limit === 'number' && props.limit > 0 ? props.limit : ''
);
const matchedLabel = computed(() =>
  typeof props.matched === 'number' && props.matched > 0 ? props.matched : limitLabel.value
);
const titleLabel = computed(() => {
  if (!props.truncated) return props.title;
  const n = limitLabel.value;
  return n ? `${props.title}（Top ${n}+）` : `${props.title}+`;
});
</script>
<style scoped>
.list-cap-hint {
  margin: 0 0 10px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>
