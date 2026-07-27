<template>
  <section v-loading="loading" class="page-stack performance-console">
    <ErrorAlert :message="loadError" />
    <!-- Residual #277: RECOMMEND_CACHE_CAP source undercount honesty. -->
    <p v-if="sourceTruncated" class="list-cap-hint">
      推荐源仅加载评分前 {{ sourceLimit }} 个在售套餐（匹配
      {{ sourceMatchedCount }}），效果汇总可能不完整。
    </p>
    <PerformanceReviewBoard :review="perf.review" />
    <PerformanceChartsGrid :version-option="versionOption" :channel-option="channelOption" />
    <PerformanceItemsTable
      :items="perf.items ?? []"
      :items-truncated="itemsTruncated"
      :items-limit="itemsLimit"
      :items-loaded="itemsLoaded"
      :title-join-truncated="titleJoinTruncated"
      :title-join-limit="titleJoinLimit"
      :title-join-loaded="titleJoinLoaded"
      :title-join-missed="titleJoinMissed"
    />
  </section>
</template>
<script setup lang="ts">
import ErrorAlert from '../components/ErrorAlert.vue';
import PerformanceReviewBoard from '../features/performance/components/PerformanceReviewBoard.vue';
import PerformanceItemsTable from '../features/performance/components/PerformanceItemsTable.vue';
import PerformanceChartsGrid from '../features/performance/components/PerformanceChartsGrid.vue';
import { usePerformancePage } from '../features/performance/composables/usePerformancePage';
const {
  loading,
  loadError,
  perf,
  versionOption,
  channelOption,
  // Residual #277
  sourceTruncated,
  sourceLimit,
  sourceMatchedCount,
  // Residual #284
  itemsTruncated,
  itemsLimit,
  itemsLoaded,
  // Residual #286
  titleJoinTruncated,
  titleJoinLimit,
  titleJoinLoaded,
  titleJoinMissed
} = usePerformancePage();
</script>
<style src="../styles/views/performance.css" scoped></style>
