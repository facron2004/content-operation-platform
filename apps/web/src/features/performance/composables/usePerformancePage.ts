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
  const versionOption = computed(() => buildPerformanceVersionOption(perf.value.versionComparison));
  const channelOption = computed(() => buildPerformanceChannelOption(perf.value.items));
  onMounted(load);
  return { loading, loadError, perf, versionOption, channelOption };
}
