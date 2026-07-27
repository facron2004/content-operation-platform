import { computed, onMounted } from 'vue';
import type { PerformanceResponse } from '@content/shared';
import { api } from '../../../services/api';
import { useApiFetch } from '../../../composables/useApiFetch';
import {
  buildPerformanceChannelOption,
  buildPerformanceVersionOption
} from '../performance-charts';
type PerformanceData = PerformanceResponse;
export function usePerformancePage() {
  const {
    loading,
    data: performance,
    error: loadError,
    load
  } = useApiFetch<PerformanceData>(() => api.getPerformance(), {
    errorMessage: '效果数据加载失败，请稍后重试',
    clearCacheOnForce: false
  });
  const perf = computed<PerformanceData>(
    () =>
      performance.value ?? {
        items: [],
        versionComparison: [],
        review: { date: '', whatHappened: [], tomorrowSuggestions: [], highConversionCopies: [] }
      }
  );
  // Residual #277: RECOMMEND_CACHE_CAP source undercount honesty.
  const sourceTruncated = computed(() => perf.value.sourceTruncated === true);
  const sourceLimit = computed(() => perf.value.sourceLimit ?? 0);
  const sourceMatchedCount = computed(() => perf.value.sourceMatchedCount ?? 0);
  // Residual #284: DASHBOARD_COPY_PERF_TAKE head honesty.
  const itemsTruncated = computed(() => perf.value.itemsTruncated === true);
  const itemsLimit = computed(() => perf.value.itemsLimit ?? 0);
  const itemsLoaded = computed(() => perf.value.itemsLoaded ?? 0);
  // Residual #286: DASHBOARD_GENERATED_COPY_TAKE title-join honesty.
  const titleJoinTruncated = computed(() => perf.value.titleJoinTruncated === true);
  const titleJoinLimit = computed(() => perf.value.titleJoinLimit ?? 0);
  const titleJoinLoaded = computed(() => perf.value.titleJoinLoaded ?? 0);
  const titleJoinMissed = computed(() => perf.value.titleJoinMissed ?? 0);
  const versionOption = computed(() => buildPerformanceVersionOption(perf.value.versionComparison));
  const channelOption = computed(() => buildPerformanceChannelOption(perf.value.items));
  onMounted(load);
  return {
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
  };
}
