<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { StaleBucket } from '../composables/useMovementList';
import { buildMovementBucketOption } from '../composables/movement-list-ui';
import type { ChartClickPayload } from '../../../components/chart-panel-runtime';
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
const props = defineProps<{
  bucketDistribution: Array<{ bucket: StaleBucket; totalSku: number }>;
  bucketColor: (bucket: StaleBucket) => string;
  bucketLabel: (bucket: StaleBucket) => string;
}>();
const emit = defineEmits<{ 'bucket-click': [bucket: StaleBucket] }>(),
  chartOption = computed(() => buildMovementBucketOption(props.bucketDistribution));
function onChartClick(payload: ChartClickPayload) {
  const key = payload.data?.key;
  if (typeof key === 'string' && key) emit('bucket-click', key as StaleBucket);
}
</script>
<template>
  <section class="panel distribution">
    <header><h3>不动销阶梯分布</h3></header>
    <div class="bucket-row">
      <div
        v-for="b in bucketDistribution"
        :key="b.bucket"
        class="bucket-card"
        :style="{ borderColor: bucketColor(b.bucket) }"
        @click="$emit('bucket-click', b.bucket)"
      >
        <span class="bucket-label" :style="{ color: bucketColor(b.bucket) }">
          {{ bucketLabel(b.bucket) }}
        </span>
        <strong class="bucket-value">{{ b.totalSku }}</strong>
        <span class="bucket-hint">点击查看 SKU</span>
      </div>
    </div>
    <ChartPanel :option="chartOption" @click="onChartClick" />
  </section>
</template>
