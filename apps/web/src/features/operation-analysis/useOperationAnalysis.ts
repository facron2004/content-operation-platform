import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { beijingDateKey } from '@content/shared';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import {
  getGmvDistribution,
  getGmvToday,
  getGmvTrend,
  type GmvDistributionRow,
  type GmvKpi,
  type GmvTrendPoint
} from '../../services/api/gmv.api';
import { extractErrorMessage } from '../../services/http-client';
import { buildGmvTrendOption } from '../gmv/composables/gmv-chart-ui';
import { displayMoney, formatPercent } from '../../utils/format';

export type AnalysisDimension = 'area' | 'category';

export function resolveAnalysisDimension(
  routeName: unknown,
  queryDimension: unknown
): AnalysisDimension {
  if (queryDimension === 'category') return 'category';
  if (queryDimension === 'area') return 'area';
  return routeName === 'operation-category' ? 'category' : 'area';
}

export function useOperationAnalysis(route: RouteLocationNormalizedLoaded) {
  const todayText = beijingDateKey();
  const kpiDate = ref(todayText);
  const dimension = ref<AnalysisDimension>(
    resolveAnalysisDimension(route.name, route.query.dimension ?? route.query.dim)
  );
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const kpi = ref<GmvKpi | null>(null);
  const trend = ref<GmvTrendPoint[]>([]);
  const distribution = ref<GmvDistributionRow[]>([]);
  const distributionLimit = ref<number | null>(null);
  const distributionMatched = ref<number | null>(null);
  const distributionTruncated = ref(false);
  const disposed = ref(false);
  let requestId = 0;
  let distributionRequestId = 0;

  const dimensionLabel = computed(() => (dimension.value === 'area' ? '区域' : '类目'));
  const dimensionTitle = computed(() => `${dimensionLabel.value}净 GMV 分布`);
  const trendOption = computed(() => buildGmvTrendOption(trend.value, 'volume', 'day'));
  const latestTrend = computed(() => trend.value[trend.value.length - 1] ?? null);
  const totalGmvDisplay = computed(() => displayMoney(kpi.value, 'totalGmv'));
  const latestGmvDisplay = computed(() => displayMoney(latestTrend.value, 'totalGmv'));
  const topDimension = computed(() => distribution.value[0] ?? null);
  const topDimensionShare = computed(() =>
    topDimension.value ? formatPercent(topDimension.value.share) : '—'
  );
  const visibleShare = computed(() => {
    if (!distribution.value.length) return '—';
    const share = distribution.value.reduce((total, row) => total + (row.share || 0), 0);
    return formatPercent(share);
  });

  function isCurrent(id: number) {
    return !disposed.value && id === requestId;
  }

  async function loadDistribution(force = false) {
    if (disposed.value) return;
    const id = ++distributionRequestId;
    const nextDimension = dimension.value;
    const date = kpiDate.value;
    try {
      const payload = await getGmvDistribution(nextDimension, 20, force, date);
      if (disposed.value || id !== distributionRequestId) return;
      distribution.value = payload.items ?? [];
      distributionLimit.value = payload.limit ?? null;
      distributionMatched.value = payload.matched ?? null;
      distributionTruncated.value = Boolean(payload.truncated);
    } catch (error) {
      if (!disposed.value && id === distributionRequestId) {
        const label = nextDimension === 'area' ? '区域' : '类目';
        loadError.value = extractErrorMessage(error, `加载${label}分析失败`);
      }
    }
  }

  async function reload(force = false) {
    if (disposed.value) return;
    const id = ++requestId;
    const distributionId = ++distributionRequestId;
    const date = kpiDate.value;
    const nextDimension = dimension.value;
    loading.value = true;
    loadError.value = null;
    try {
      const [nextKpi, nextTrend, nextDistribution] = await Promise.all([
        getGmvToday(date, force),
        getGmvTrend(30, date, force, 'day'),
        getGmvDistribution(nextDimension, 20, force, date)
      ]);
      if (!isCurrent(id)) return;
      kpi.value = nextKpi;
      trend.value = nextTrend;
      if (distributionId === distributionRequestId) {
        distribution.value = nextDistribution.items ?? [];
        distributionLimit.value = nextDistribution.limit ?? null;
        distributionMatched.value = nextDistribution.matched ?? null;
        distributionTruncated.value = Boolean(nextDistribution.truncated);
      }
    } catch (error) {
      if (isCurrent(id)) loadError.value = extractErrorMessage(error, '加载经营分析失败');
    } finally {
      if (isCurrent(id)) loading.value = false;
    }
  }

  function onDimensionChange(next: AnalysisDimension) {
    if (dimension.value === next) return;
    dimension.value = next;
    distribution.value = [];
    distributionLimit.value = null;
    distributionMatched.value = null;
    distributionTruncated.value = false;
    void loadDistribution();
  }

  function onDateChange(date: string) {
    kpiDate.value = date || todayText;
    void reload();
  }

  function disableFutureDate(date: Date) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return date.getTime() > today.getTime();
  }

  onMounted(() => void reload());
  watch(
    () => [route.name, route.query.dimension ?? route.query.dim],
    () => {
      const nextDimension = resolveAnalysisDimension(
        route.name,
        route.query.dimension ?? route.query.dim
      );
      if (nextDimension !== dimension.value) onDimensionChange(nextDimension);
    }
  );
  onScopeDispose(() => {
    disposed.value = true;
    requestId += 1;
    distributionRequestId += 1;
  });

  return {
    todayText,
    kpiDate,
    dimension,
    dimensionLabel,
    dimensionTitle,
    loading,
    loadError,
    kpi,
    trend,
    distribution,
    distributionLimit,
    distributionMatched,
    distributionTruncated,
    trendOption,
    latestTrend,
    totalGmvDisplay,
    latestGmvDisplay,
    topDimension,
    topDimensionShare,
    visibleShare,
    onDimensionChange,
    onDateChange,
    disableFutureDate,
    loadDistribution,
    reload
  };
}
