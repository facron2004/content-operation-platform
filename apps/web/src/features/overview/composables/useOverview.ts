import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  OverviewKpi,
  OverviewTopOffender,
  OverviewTrendPoint
} from '../../../services/api/overview.api';
import { beijingDateKey } from '@content/shared';
import { formatGmv, formatPercent } from '../../../utils/format';
import { createOverviewActions } from './overview-core';
import { buildOverviewDistributionOption, buildOverviewTrendOption } from './overview-chart';

export function useOverview() {
  const router = useRouter();
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const kpi = ref<OverviewKpi | null>(null);
  const trend = ref<OverviewTrendPoint[]>([]);
  const distribution = ref<Array<{ key: string; totalSku: number; stockLeft: number }>>([]);
  const topOffenders = ref<OverviewTopOffender[]>([]);
  const offendersLoading = ref(false);
  const todayText = beijingDateKey();
  const trendDays = ref<7 | 30>(7);
  const staleDim = ref<'stale' | 'area' | 'category'>('stale');
  const actions = createOverviewActions({
    loading,
    loadError,
    kpi,
    trend,
    distribution,
    topOffenders,
    offendersLoading,
    trendDays,
    staleDim,
    router
  });
  onMounted(actions.reload);
  return {
    loading,
    loadError,
    kpi,
    topOffenders,
    offendersLoading,
    todayText,
    trendDays,
    staleDim,
    trendOption: computed(() => buildOverviewTrendOption(trend.value)),
    distributionOption: computed(() =>
      buildOverviewDistributionOption(distribution.value, staleDim.value)
    ),
    offendersEmptyText: computed(() =>
      topOffenders.value.length === 0 && !offendersLoading.value ? '暂无零动销商家' : '加载中…'
    ),
    formatGmv,
    formatPercent,
    ...actions
  };
}
