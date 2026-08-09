import { ref, type Ref } from 'vue';
import { beijingDateKey } from '@content/shared';
import {
  getGmvByMerchant,
  getGmvDistribution,
  getGmvHourly,
  getGmvToday,
  getGmvTrend,
  type GmvDistributionRow,
  type GmvHourlyPoint,
  type GmvKpi,
  type GmvMerchantRow,
  type GmvRefreshJob,
  type GmvRefreshResult,
  type GmvTrendPoint
} from '../../../services/api/gmv.api';
import { extractErrorMessage } from '../../../services/http-client';
import type { GmvTrendGranularity, GmvTrendMode } from './gmv-chart-ui';

export type GmvCategoryRow = {
  name: string;
  value: number;
  share: number;
  color: string;
};

export type GmvChannelRow = {
  name: string;
  value: number;
  share: number;
  color: string;
};

export type GmvFunnelStage = {
  label: string;
  value: number;
  rate: number;
  color: string;
};

export type GmvActivityRow = {
  name: string;
  dateRange: string;
  gmv: number;
  roi: number;
  verifyRate: number;
};

export type GmvHeatPoint = {
  name: string;
  value: [number, number, number];
};

export type GmvAlertItem = {
  id: string;
  region: string;
  title: string;
  time: string;
  tone: 'danger' | 'warning' | 'info';
};

export type GmvRequestGuard = () => boolean;

/** 按日期区间回填：开始与结束日期（YYYY-MM-DD，含端点）。 */
export type GmvBackfillRange = { startDate: string; endDate: string };

export function createGmvCockpitState() {
  const todayText = beijingDateKey();
  return {
    loading: ref(false),
    loadError: ref<string | null>(null),
    extrasError: ref<string | null>(null),
    kpi: ref<GmvKpi | null>(null),
    trend: ref<GmvTrendPoint[]>([]),
    hourly: ref<GmvHourlyPoint[]>([]),
    distribution: ref<GmvDistributionRow[]>([]),
    topMerchants: ref<GmvMerchantRow[]>([]),
    trendGranularity: ref<GmvTrendGranularity>('day'),
    trendMode: ref<GmvTrendMode>('volume'),
    distDim: ref<'area' | 'category'>('area'),
    merchantSort: ref<'gmvDesc' | 'refundDesc' | 'verifyDesc'>('gmvDesc'),
    // Residual #230: top-merchants pagination (API returns hasMore; SPA used page=1 only).
    merchantPage: ref(1),
    merchantPageSize: ref(20),
    merchantHasMore: ref(false),
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    merchantTruncated: ref(false),
    merchantLimit: ref<number | null>(null),
    // Residual #289: GMV distribution Top-N honesty.
    distributionTruncated: ref(false),
    distributionLimit: ref<number | null>(null),
    distributionMatched: ref<number | null>(null),
    todayText,
    kpiDate: ref(todayText),
    backfilling: ref(false),
    // Live progress text for the backfill/refresh job (set by pollGmvRefreshJob).
    backfillStatusText: ref(''),
    categories: ref<GmvCategoryRow[]>([]),
    channels: ref<GmvChannelRow[]>([]),
    funnel: ref<GmvFunnelStage[]>([]),
    activities: ref<GmvActivityRow[]>([]),
    heatPoints: ref<GmvHeatPoint[]>([]),
    heatCity: ref<string>('成都市'),
    alerts: ref<GmvAlertItem[]>([])
  };
}

async function loadGmvValue<T>(
  run: () => Promise<T>,
  target: Ref<T>,
  loadError: Ref<string | null>,
  fallback: string,
  isCurrent: GmvRequestGuard = () => true
) {
  try {
    const value = await run();
    if (isCurrent()) target.value = value;
  } catch (err) {
    if (!isCurrent()) return;
    loadError.value = extractErrorMessage(err, fallback);
  }
}

export const loadGmvKpis = (
  kpiDate: string,
  kpi: Ref<GmvKpi | null>,
  loadError: Ref<string | null>,
  isCurrent?: GmvRequestGuard
) => loadGmvValue(() => getGmvToday(kpiDate, true), kpi, loadError, '加载 KPI 失败', isCurrent);

export const loadGmvTrend = (
  granularity: GmvTrendGranularity,
  kpiDate: string,
  trend: Ref<GmvTrendPoint[]>,
  loadError: Ref<string | null>,
  isCurrent?: GmvRequestGuard
) => {
  // Interactive GMV trend shares the 90d money-read cap (API rejects 365).
  const days = granularity === 'day' ? 30 : 90;
  return loadGmvValue(
    () => getGmvTrend(days, kpiDate, true, granularity),
    trend,
    loadError,
    '加载趋势失败',
    isCurrent
  );
};

export const loadGmvHourly = (
  kpiDate: string,
  hourly: Ref<GmvHourlyPoint[]>,
  loadError: Ref<string | null>,
  isCurrent?: GmvRequestGuard
) => loadGmvValue(() => getGmvHourly(kpiDate, true), hourly, loadError, '加载分时失败', isCurrent);

export async function loadGmvDistribution(
  dim: 'area' | 'category',
  distribution: Ref<GmvDistributionRow[]>,
  loadError: Ref<string | null>,
  // Residual #289: optional honesty sinks for Top-N distribution head.
  distributionTruncated?: Ref<boolean>,
  distributionLimit?: Ref<number | null>,
  distributionMatched?: Ref<number | null>,
  isCurrent: GmvRequestGuard = () => true
) {
  try {
    const payload = await getGmvDistribution(dim, 10, true);
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
    if (!isCurrent()) return;
    loadError.value = extractErrorMessage(err, '加载分布失败');
  }
}

export async function loadGmvTopMerchants(params: {
  sort: 'gmvDesc' | 'refundDesc' | 'verifyDesc';
  page: number;
  pageSize: number;
  topMerchants: Ref<GmvMerchantRow[]>;
  hasMore: Ref<boolean>;
  // Residual #265: optional honesty sinks.
  truncated?: Ref<boolean>;
  limit?: Ref<number | null>;
  isCurrent?: GmvRequestGuard;
  loadError: Ref<string | null>;
}) {
  try {
    // Residual #230: honor page/pageSize + hasMore from API.
    const result = await getGmvByMerchant(params.sort, params.page, params.pageSize, true);
    if (params.isCurrent && !params.isCurrent()) return;
    params.topMerchants.value = result.items;
    params.hasMore.value = !!result.hasMore;
    // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
    if (params.truncated) params.truncated.value = Boolean(result.truncated);
    if (params.limit) {
      params.limit.value =
        typeof result.limit === 'number' && Number.isFinite(result.limit) ? result.limit : null;
    }
  } catch (err) {
    if (params.isCurrent && !params.isCurrent()) return;
    params.loadError.value = extractErrorMessage(err, '加载商家榜失败');
  }
}

export {
  backfillGmvHistory,
  describeRefreshProgress,
  pollGmvRefreshJob,
  refreshGmvCockpit
} from './gmv-refresh-lifecycle';

export type { RefreshPollError, RefreshPollErrorCode } from './gmv-refresh-lifecycle';
