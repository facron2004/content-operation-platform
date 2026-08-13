import { onScopeDispose, type Ref } from 'vue';
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
type IsCurrent = () => boolean;

async function loadOverviewKpis(
  kpi: Ref<OverviewKpi | null>,
  loadError: Ref<string | null>,
  // Residual #224: as-of business day (OverviewKpiQueryDto.date).
  date: string | undefined,
  force: boolean,
  isCurrent: IsCurrent
) {
  try {
    const nextKpi = await getOverviewKpis(date || undefined, force);
    if (isCurrent()) kpi.value = nextKpi;
  } catch (err) {
    if (isCurrent()) loadError.value = extractErrorMessage(err, '加载 KPI 失败');
  }
}

async function loadOverviewTrend(
  days: 7 | 30,
  trend: Ref<OverviewTrendPoint[]>,
  loadError: Ref<string | null>,
  // Residual #224: endDate aligns trend window with KPI as-of day.
  endDate: string | undefined,
  force: boolean,
  isCurrent: IsCurrent
) {
  try {
    const nextTrend = await getOverviewTrend(days, endDate || undefined, force);
    if (isCurrent()) trend.value = nextTrend;
  } catch (err) {
    if (isCurrent()) loadError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

async function loadOverviewDistribution(
  dim: 'stale' | 'area' | 'category',
  distribution: Ref<Dist>,
  loadError: Ref<string | null>,
  date: string | undefined,
  force: boolean,
  isCurrent: IsCurrent,
  // Residual #288: optional honesty sinks for Top-N distribution head.
  distributionTruncated?: Ref<boolean>,
  distributionLimit?: Ref<number | null>,
  distributionMatched?: Ref<number | null>
) {
  try {
    const payload = await getOverviewDistribution(dim, 20, date || undefined, force);
    if (!isCurrent()) return;
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
    if (isCurrent()) loadError.value = extractErrorMessage(err, '加载分布失败');
  }
}

async function loadOverviewTopOffenders(
  topOffenders: Ref<OverviewTopOffender[]>,
  offendersLoading: Ref<boolean>,
  loadError: Ref<string | null>,
  date: string | undefined,
  force: boolean,
  isCurrent: IsCurrent,
  // Residual #287: optional honesty sinks for Top-N head.
  offendersTruncated?: Ref<boolean>,
  offendersLimit?: Ref<number | null>,
  offendersMatched?: Ref<number | null>
) {
  if (!isCurrent()) return;
  offendersLoading.value = true;
  try {
    const payload = await getOverviewTopOffenders(10, date || undefined, force);
    if (!isCurrent()) return;
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
    if (isCurrent()) loadError.value = extractErrorMessage(err, '加载零动销商家失败');
  } finally {
    if (isCurrent()) offendersLoading.value = false;
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
  let disposed = false;
  let reloadRequestId = 0;
  let kpiRequestId = 0;
  let trendRequestId = 0;
  let distributionRequestId = 0;
  let offendersRequestId = 0;

  onScopeDispose(() => {
    disposed = true;
    reloadRequestId += 1;
    kpiRequestId += 1;
    trendRequestId += 1;
    distributionRequestId += 1;
    offendersRequestId += 1;
    params.loading.value = false;
    params.offendersLoading.value = false;
  }, true);

  async function loadTrend() {
    if (disposed) return;
    const requestId = ++trendRequestId;
    return loadOverviewTrend(
      params.trendDays.value,
      params.trend,
      params.loadError,
      params.kpiDate.value || undefined,
      false,
      () => !disposed && requestId === trendRequestId
    );
  }

  async function loadDistribution() {
    if (disposed) return;
    const requestId = ++distributionRequestId;
    return loadOverviewDistribution(
      params.staleDim.value,
      params.distribution,
      params.loadError,
      params.kpiDate.value || undefined,
      false,
      () => !disposed && requestId === distributionRequestId,
      params.distributionTruncated,
      params.distributionLimit,
      params.distributionMatched
    );
  }

  async function reload(force = false) {
    if (disposed) return;
    const currentReloadId = ++reloadRequestId;
    const currentKpiRequestId = ++kpiRequestId;
    const currentTrendRequestId = ++trendRequestId;
    const currentDistributionRequestId = ++distributionRequestId;
    const currentOffendersRequestId = ++offendersRequestId;
    params.loading.value = true;
    params.loadError.value = null;
    const asOf = params.kpiDate.value || undefined;
    await Promise.all([
      loadOverviewKpis(
        params.kpi,
        params.loadError,
        asOf,
        force,
        () => !disposed && currentKpiRequestId === kpiRequestId
      ),
      loadOverviewTrend(
        params.trendDays.value,
        params.trend,
        params.loadError,
        asOf,
        force,
        () => !disposed && currentTrendRequestId === trendRequestId
      ),
      loadOverviewDistribution(
        params.staleDim.value,
        params.distribution,
        params.loadError,
        asOf,
        force,
        () => !disposed && currentDistributionRequestId === distributionRequestId,
        params.distributionTruncated,
        params.distributionLimit,
        params.distributionMatched
      ),
      loadOverviewTopOffenders(
        params.topOffenders,
        params.offendersLoading,
        params.loadError,
        asOf,
        force,
        () => !disposed && currentOffendersRequestId === offendersRequestId,
        params.offendersTruncated,
        params.offendersLimit,
        params.offendersMatched
      )
    ]);
    if (!disposed && currentReloadId === reloadRequestId) params.loading.value = false;
  }
  return {
    reload,
    loadTrend,
    loadDistribution,
    goZeroSales: (merchantId?: string) =>
      params.router.push({ name: 'zero-sales', query: merchantId ? { merchantId } : undefined }),
    offenderRowClass: overviewOffenderRowClass
  };
}
