<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { StaleBucket } from '../composables/useMovementList';
import {
  buildMovementBucketOption,
  buildMovementHealthOption
} from '../composables/movement-list-ui';
import type { ChartClickPayload } from '../../../components/chart-panel-runtime';
import { formatPercent } from '../../../utils/format';
const ChartPanel = defineAsyncComponent(() => import('../../../components/ChartPanel.vue'));
const props = defineProps<{
  bucketDistribution: Array<{ bucket: StaleBucket; totalSku: number }>;
  bucketColor: (bucket: StaleBucket) => string;
  bucketLabel: (bucket: StaleBucket) => string;
}>();
const emit = defineEmits<{ 'bucket-click': [bucket: StaleBucket] }>(),
  chartOption = computed(() => buildMovementBucketOption(props.bucketDistribution)),
  healthOption = computed(() => buildMovementHealthOption(props.bucketDistribution));

const bucketOrder: StaleBucket[] = ['stale_60d', 'stale_30d', 'stale_15d', 'stale_7d', 'normal'];

const bucketRows = computed(() => {
  const byBucket = new Map(props.bucketDistribution.map((item) => [item.bucket, item.totalSku]));
  const rows = bucketOrder.map((bucket) => ({
    bucket,
    totalSku: byBucket.get(bucket) ?? 0
  }));
  const total = rows.reduce((sum, item) => sum + item.totalSku, 0);
  return rows.map((item) => ({
    ...item,
    share: total > 0 ? item.totalSku / total : 0
  }));
});

const totalSku = computed(() => bucketRows.value.reduce((sum, item) => sum + item.totalSku, 0));

const insights = computed(() => {
  const get = (bucket: StaleBucket) =>
    bucketRows.value.find((item) => item.bucket === bucket) ?? {
      bucket,
      totalSku: 0,
      share: 0
    };
  const severe = get('stale_60d');
  const recoveryTotal = get('stale_30d').totalSku + get('stale_15d').totalSku;
  const recoveryShare = totalSku.value > 0 ? recoveryTotal / totalSku.value : 0;
  const watch = get('stale_7d');

  return [
    `${props.bucketLabel('stale_60d')} SKU 占比 ${formatPercent(severe.share)}，建议优先清退或促销处理`,
    `15–30 天未销 SKU 合计占比 ${formatPercent(recoveryShare)}，存在动销潜力`,
    `${props.bucketLabel('stale_7d')} SKU 占比 ${formatPercent(watch.share)}，关注短期转化策略`
  ];
});

function onChartClick(payload: ChartClickPayload) {
  const key = payload.data?.key;
  if (typeof key === 'string' && key) emit('bucket-click', key as StaleBucket);
}
</script>
<template>
  <section class="movement-analytics">
    <article class="panel movement-analysis-card distribution">
      <header class="movement-analysis-header">
        <div>
          <h3>不动销阶梯分布</h3>
          <p>按最近销售间隔识别库存风险，点击条目下钻 SKU</p>
        </div>
        <span class="movement-total">{{ totalSku }} SKU</span>
      </header>
      <ChartPanel :option="chartOption" @click="onChartClick" />
    </article>

    <article class="panel movement-analysis-card health-structure">
      <header class="movement-analysis-header">
        <div>
          <h3>库存健康结构</h3>
          <p>风险构成与当前优先处理方向</p>
        </div>
      </header>
      <div class="health-layout">
        <div class="health-chart-wrap">
          <ChartPanel :option="healthOption" @click="onChartClick" />
          <div class="health-chart-center">
            <strong>{{ totalSku }}</strong>
            <span>总 SKU</span>
          </div>
        </div>

        <div class="health-legend" aria-label="库存健康结构图例">
          <button
            v-for="row in bucketRows"
            :key="row.bucket"
            type="button"
            @click="$emit('bucket-click', row.bucket)"
          >
            <span class="health-legend-dot" :style="{ background: bucketColor(row.bucket) }" />
            <span>{{ bucketLabel(row.bucket) }}</span>
            <strong>{{ row.totalSku }}</strong>
            <em>{{ formatPercent(row.share) }}</em>
          </button>
        </div>

        <aside class="movement-insights">
          <h4>关键洞察</h4>
          <ol>
            <li v-for="(insight, index) in insights" :key="insight">
              <span>{{ index + 1 }}</span>
              <p>{{ insight }}</p>
            </li>
          </ol>
        </aside>
      </div>
    </article>
  </section>
</template>
