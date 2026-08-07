<script setup lang="ts">
import type { TrendBucket } from '../../../services/api/refund.api';

const props = defineProps<{
  activeTab: string;
  trendDays: 7 | 30;
  trendBucket: TrendBucket;
  trendOption: unknown;
}>();
const emit = defineEmits<{
  'update:trendDays': [value: 7 | 30];
  'update:trendBucket': [value: TrendBucket];
  change: [];
}>();

const BUCKETS: { label: string; value: TrendBucket }[] = [
  { label: '按日', value: 'day' },
  { label: '按周', value: 'week' },
  { label: '按月', value: 'month' },
  { label: '按年', value: 'year' }
];

function onBucketUpdate(value: string | number | boolean) {
  emit('update:trendBucket', value as TrendBucket);
  emit('change');
}
</script>
<template>
  <section class="panel chart-card">
    <header>
      <h3>{{ activeTab === 'refund' ? '退款率' : '核销率' }} 趋势</h3>
      <div class="trend-controls">
        <el-radio-group
          :model-value="trendDays"
          size="small"
          @update:model-value="$emit('update:trendDays', Number($event) === 30 ? 30 : 7)"
          @change="$emit('change')"
        >
          <el-radio-button :value="7">近 7 日</el-radio-button>
          <el-radio-button :value="30">近 30 日</el-radio-button>
        </el-radio-group>
        <el-radio-group :model-value="trendBucket" size="small" @update:model-value="onBucketUpdate">
          <el-radio-button v-for="b in BUCKETS" :key="b.value" :value="b.value">{{ b.label }}</el-radio-button>
        </el-radio-group>
      </div>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.trend-controls {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
