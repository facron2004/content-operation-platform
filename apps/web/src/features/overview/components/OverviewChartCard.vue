<template>
  <section class="panel chart-card">
    <header>
      <h3>{{ titleLabel }}</h3>
      <slot name="controls" />
    </header>
    <!-- Residual #288: distribution Top-N honesty banner. -->
    <p v-if="truncated" class="list-cap-hint">
      仅展示 Top {{ limitLabel }} 分桶（至少匹配
      {{ matchedLabel }} 个），图表占比按截断后的子集计算，并非全量。
    </p>
    <ChartPanel :option="option" />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
const props = withDefaults(
  defineProps<{
    title: string;
    option: Record<string, unknown>;
    // Residual #288: optional Top-N honesty for distribution chart.
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
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
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
