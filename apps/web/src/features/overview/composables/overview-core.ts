import type { Ref } from 'vue';
import type { Router } from 'vue-router';
import {
  getOverviewDistribution,
  getOverviewKpis,
  getOverviewTopOffenders,
  getOverviewTrend,
  type OverviewKpi,
  type OverviewTopOffender,
  type OverviewTrendPoint
} from '../../../services/api/overview.api';
import { extractErrorMessage } from '../../../services/http-client';

type Dist = Array<{ key: string; totalSku: number; stockLeft: number }>;

async function loadOverviewKpis(
  kpi: Ref<OverviewKpi | null>,
  loadError: Ref<string | null>,
  // Residual #224: as-of business day (OverviewKpiQueryDto.date).
  date?: string
) {
  try {
    kpi.value = await getOverviewKpis(date || undefined);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载 KPI 失败');
  }
}

async function loadOverviewTrend(
  days: 7 | 30,
  trend: Ref<OverviewTrendPoint[]>,
  loadError: Ref<string | null>,
  // Residual #224: endDate aligns trend window with KPI as-of day.
  endDate?: string
) {
  try {
    trend.value = await getOverviewTrend(days, endDate || undefined);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

async function loadOverviewDistribution(
  dim: 'stale' | 'area' | 'category',
  distribution: Ref<Dist>,
  loadError: Ref<string | null>,
  // Residual #288: optional honesty sinks for Top-N distribution head.
  distributionTruncated?: Ref<boolean>,
  distributionLimit?: Ref<number | null>,
  distributionMatched?: Ref<number | null>
) {
  try {
    const payload = await getOverviewDistribution(dim, 20);
    distribution.value = payload.items ?? [];
    if (distributionTruncated) distributionTruncated.value = Boolean(payload.truncated);
    if (distributionLimit) {
      distributionLimit.value =
        typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : null;
    }
    if (distributionMatched) {
      distributionMatched.value =
        typeof payload.matched === 'number' && Number.isFinite(payload.matched)
          ? payload.matched
          : null;
    }
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载分布失败');
  }
}

async function loadOverviewTopOffenders(
  topOffenders: Ref<OverviewTopOffender[]>,
  offendersLoading: Ref<boolean>,
  loadError: Ref<string | null>,
  // Residual #287: optional honesty sinks for Top-N head.
  offendersTruncated?: Ref<boolean>,
  offendersLimit?: Ref<number | null>,
  offendersMatched?: Ref<number | null>
) {
  offendersLoading.value = true;
  try {
    const payload = await getOverviewTopOffenders(10);
    topOffenders.value = payload.items ?? [];
    if (offendersTruncated) offendersTruncated.value = Boolean(payload.truncated);
    if (offendersLimit) {
      offendersLimit.value =
        typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : null;
    }
    if (offendersMatched) {
      offendersMatched.value =
        typeof payload.matched === 'number' && Number.isFinite(payload.matched)
          ? payload.matched
          : null;
    }
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载零动销商家失败');
  } finally {
    offendersLoading.value = false;
  }
}

function overviewOffenderRowClass({ row }: { row: OverviewTopOffender }) {
  if (row.stale30SkuCount >= 10) return 'is-danger';
  if (row.stale30SkuCount >= 5) return 'is-warning';
  return '';
}

export function createOverviewActions(params: {
  loading: Ref<boolean>;
  loadError: Ref<string | null>;
  kpi: Ref<OverviewKpi | null>;
  trend: Ref<OverviewTrendPoint[]>;
  distribution: Ref<Dist>;
  topOffenders: Ref<OverviewTopOffender[]>;
  offendersLoading: Ref<boolean>;
  // Residual #287: Top-N honesty sinks.
  offendersTruncated?: Ref<boolean>;
  offendersLimit?: Ref<number | null>;
  offendersMatched?: Ref<number | null>;
  // Residual #288: distribution Top-N honesty sinks.
  distributionTruncated?: Ref<boolean>;
  distributionLimit?: Ref<number | null>;
  distributionMatched?: Ref<number | null>;
  trendDays: Ref<7 | 30>;
  staleDim: Ref<'stale' | 'area' | 'category'>;
  // Residual #224: KPI/trend as-of day (default Beijing today).
  kpiDate: Ref<string>;
  router: Router;
}) {
  async function reload() {
    params.loading.value = true;
    params.loadError.value = null;
    const asOf = params.kpiDate.value || undefined;
    await Promise.all([
      loadOverviewKpis(params.kpi, params.loadError, asOf),
      loadOverviewTrend(params.trendDays.value, params.trend, params.loadError, asOf),
      loadOverviewDistribution(
        params.staleDim.value,
        params.distribution,
        params.loadError,
        params.distributionTruncated,
        params.distributionLimit,
        params.distributionMatched
      ),
      loadOverviewTopOffenders(
        params.topOffenders,
        params.offendersLoading,
        params.loadError,
        params.offendersTruncated,
        params.offendersLimit,
        params.offendersMatched
      )
    ]);
    params.loading.value = false;
  }
  return {
    reload,
    loadTrend: () =>
      loadOverviewTrend(
        params.trendDays.value,
        params.trend,
        params.loadError,
        params.kpiDate.value || undefined
      ),
    loadDistribution: () =>
      loadOverviewDistribution(
        params.staleDim.value,
        params.distribution,
        params.loadError,
        params.distributionTruncated,
        params.distributionLimit,
        params.distributionMatched
      ),
    goZeroSales: (merchantId?: string) =>
      params.router.push({ name: 'zero-sales', query: merchantId ? { merchantId } : undefined }),
    offenderRowClass: overviewOffenderRowClass
  };
}
