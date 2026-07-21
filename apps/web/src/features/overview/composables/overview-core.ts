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

async function loadOverviewKpis(kpi: Ref<OverviewKpi | null>, loadError: Ref<string | null>) {
  try {
    kpi.value = await getOverviewKpis();
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载 KPI 失败');
  }
}

async function loadOverviewTrend(
  days: 7 | 30,
  trend: Ref<OverviewTrendPoint[]>,
  loadError: Ref<string | null>
) {
  try {
    trend.value = await getOverviewTrend(days);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载趋势失败');
  }
}

async function loadOverviewDistribution(
  dim: 'stale' | 'area' | 'category',
  distribution: Ref<Dist>,
  loadError: Ref<string | null>
) {
  try {
    distribution.value = await getOverviewDistribution(dim, 20);
  } catch (err) {
    loadError.value = extractErrorMessage(err, '加载分布失败');
  }
}

async function loadOverviewTopOffenders(
  topOffenders: Ref<OverviewTopOffender[]>,
  offendersLoading: Ref<boolean>,
  loadError: Ref<string | null>
) {
  offendersLoading.value = true;
  try {
    topOffenders.value = await getOverviewTopOffenders(10);
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
  trendDays: Ref<7 | 30>;
  staleDim: Ref<'stale' | 'area' | 'category'>;
  router: Router;
}) {
  async function reload() {
    params.loading.value = true;
    params.loadError.value = null;
    await Promise.all([
      loadOverviewKpis(params.kpi, params.loadError),
      loadOverviewTrend(params.trendDays.value, params.trend, params.loadError),
      loadOverviewDistribution(params.staleDim.value, params.distribution, params.loadError),
      loadOverviewTopOffenders(params.topOffenders, params.offendersLoading, params.loadError)
    ]);
    params.loading.value = false;
  }
  return {
    reload,
    loadTrend: () => loadOverviewTrend(params.trendDays.value, params.trend, params.loadError),
    loadDistribution: () =>
      loadOverviewDistribution(params.staleDim.value, params.distribution, params.loadError),
    goZeroSales: (merchantId?: string) =>
      params.router.push({ name: 'zero-sales', query: merchantId ? { merchantId } : undefined }),
    offenderRowClass: overviewOffenderRowClass
  };
}
