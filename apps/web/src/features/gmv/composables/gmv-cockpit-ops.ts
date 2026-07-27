import { computed, type Ref } from 'vue';
import type {
  GmvDistributionRow,
  GmvHourlyPoint,
  GmvKpi,
  GmvMerchantRow,
  GmvTrendPoint
} from '../../../services/api/gmv.api';
import {
  buildGmvDistributionOption,
  buildGmvHourlyOption,
  buildGmvTrendOption,
  type GmvTrendGranularity,
  type GmvTrendMode
} from './gmv-chart-ui';
import {
  backfillGmvHistory,
  loadGmvDistribution,
  loadGmvHourly,
  loadGmvKpis,
  loadGmvTopMerchants,
  loadGmvTrend,
  type GmvActivityRow,
  type GmvAlertItem,
  type GmvCategoryRow,
  type GmvChannelRow,
  type GmvFunnelStage,
  type GmvHeatPoint
} from './gmv-cockpit-core';
import { loadGmvCockpitExtras } from './gmv-cockpit-extras';

export function createGmvCockpitLoadAll(state: {
  kpiDate: Ref<string>;
  kpi: Ref<GmvKpi | null>;
  loadError: Ref<string | null>;
  trendGranularity: Ref<GmvTrendGranularity>;
  trend: Ref<GmvTrendPoint[]>;
  hourly: Ref<GmvHourlyPoint[]>;
  distDim: Ref<'area' | 'category'>;
  distribution: Ref<GmvDistributionRow[]>;
  merchantSort: Ref<'gmvDesc' | 'refundDesc' | 'verifyDesc'>;
  merchantPage: Ref<number>;
  merchantPageSize: Ref<number>;
  merchantHasMore: Ref<boolean>;
  topMerchants: Ref<GmvMerchantRow[]>;
  // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty sinks.
  merchantTruncated: Ref<boolean>;
  merchantLimit: Ref<number | null>;
  // Residual #289: distribution Top-N honesty sinks.
  distributionTruncated: Ref<boolean>;
  distributionLimit: Ref<number | null>;
  distributionMatched: Ref<number | null>;
  categories: Ref<GmvCategoryRow[]>;
  channels: Ref<GmvChannelRow[]>;
  funnel: Ref<GmvFunnelStage[]>;
  activities: Ref<GmvActivityRow[]>;
  heatPoints: Ref<GmvHeatPoint[]>;
  heatCity: Ref<string>;
  alerts: Ref<GmvAlertItem[]>;
}) {
  return async function loadAll() {
    // Full reload resets merchant page (sort/date/refresh).
    state.merchantPage.value = 1;
    await Promise.all([
      loadGmvKpis(state.kpiDate.value, state.kpi, state.loadError),
      loadGmvTrend(state.trendGranularity.value, state.kpiDate.value, state.trend, state.loadError),
      loadGmvHourly(state.kpiDate.value, state.hourly, state.loadError),
      loadGmvDistribution(
        state.distDim.value,
        state.distribution,
        state.loadError,
        state.distributionTruncated,
        state.distributionLimit,
        state.distributionMatched
      ),
      loadGmvTopMerchants({
        sort: state.merchantSort.value,
        page: state.merchantPage.value,
        pageSize: state.merchantPageSize.value,
        topMerchants: state.topMerchants,
        hasMore: state.merchantHasMore,
        truncated: state.merchantTruncated,
        limit: state.merchantLimit,
        loadError: state.loadError
      })
    ]);
    await loadGmvCockpitExtras({
      kpi: state.kpi,
      categories: state.categories,
      channels: state.channels,
      funnel: state.funnel,
      activities: state.activities,
      heatPoints: state.heatPoints,
      heatCity: state.heatCity,
      alerts: state.alerts
    });
  };
}

export type GmvCockpitHandlerArgs = {
  trendGranularity: Ref<GmvTrendGranularity>;
  distDim: Ref<'area' | 'category'>;
  merchantSort: Ref<'gmvDesc' | 'refundDesc' | 'verifyDesc'>;
  merchantPage: Ref<number>;
  merchantPageSize: Ref<number>;
  merchantHasMore: Ref<boolean>;
  // Residual #265
  merchantTruncated: Ref<boolean>;
  merchantLimit: Ref<number | null>;
  // Residual #289
  distributionTruncated: Ref<boolean>;
  distributionLimit: Ref<number | null>;
  distributionMatched: Ref<number | null>;
  kpiDate: Ref<string>;
  kpi: Ref<GmvKpi | null>;
  trend: Ref<GmvTrendPoint[]>;
  hourly: Ref<GmvHourlyPoint[]>;
  distribution: Ref<GmvDistributionRow[]>;
  topMerchants: Ref<GmvMerchantRow[]>;
  loadError: Ref<string | null>;
  todayText: string;
  backfilling: Ref<boolean>;
  reload: () => Promise<void>;
  loadAll: () => Promise<void>;
  categories: Ref<GmvCategoryRow[]>;
  channels: Ref<GmvChannelRow[]>;
  funnel: Ref<GmvFunnelStage[]>;
  activities: Ref<GmvActivityRow[]>;
  heatPoints: Ref<GmvHeatPoint[]>;
  heatCity: Ref<string>;
  alerts: Ref<GmvAlertItem[]>;
};

export function createGmvCockpitHandlers(args: GmvCockpitHandlerArgs) {
  async function loadTopMerchants(resetPage = false) {
    if (resetPage) args.merchantPage.value = 1;
    await loadGmvTopMerchants({
      sort: args.merchantSort.value,
      page: args.merchantPage.value,
      pageSize: args.merchantPageSize.value,
      topMerchants: args.topMerchants,
      hasMore: args.merchantHasMore,
      truncated: args.merchantTruncated,
      limit: args.merchantLimit,
      loadError: args.loadError
    });
  }
  return {
    disableFutureDate: (date: Date) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return date.getTime() > today.getTime();
    },
    loadTrend: () =>
      loadGmvTrend(args.trendGranularity.value, args.kpiDate.value, args.trend, args.loadError),
    loadHourly: () => loadGmvHourly(args.kpiDate.value, args.hourly, args.loadError),
    loadDistribution: () =>
      loadGmvDistribution(
        args.distDim.value,
        args.distribution,
        args.loadError,
        args.distributionTruncated,
        args.distributionLimit,
        args.distributionMatched
      ),
    // Sort change resets to page 1.
    loadTopMerchants: () => loadTopMerchants(true),
    prevMerchantPage() {
      if (args.merchantPage.value > 1) {
        args.merchantPage.value -= 1;
        void loadTopMerchants(false);
      }
    },
    nextMerchantPage() {
      if (args.merchantHasMore.value) {
        args.merchantPage.value += 1;
        void loadTopMerchants(false);
      }
    },
    onKpiDateChange: async () => {
      await Promise.all([
        loadGmvKpis(args.kpiDate.value, args.kpi, args.loadError),
        loadGmvTrend(args.trendGranularity.value, args.kpiDate.value, args.trend, args.loadError),
        loadGmvHourly(args.kpiDate.value, args.hourly, args.loadError)
      ]);
      // KPI 变了之后重算支付构成 / 漏斗 / 预警
      await loadGmvCockpitExtras({
        kpi: args.kpi,
        categories: args.categories,
        channels: args.channels,
        funnel: args.funnel,
        activities: args.activities,
        heatPoints: args.heatPoints,
        heatCity: args.heatCity,
        alerts: args.alerts
      });
    },
    onBackfillCommand: (days: number) =>
      backfillGmvHistory({
        todayText: args.todayText,
        days,
        backfilling: args.backfilling,
        loadError: args.loadError,
        kpiDate: args.kpiDate,
        loadAll: args.loadAll
      })
  };
}

export function useGmvCockpitDerived(params: {
  kpi: Ref<GmvKpi | null>;
  trend: Ref<GmvTrendPoint[]>;
  hourly: Ref<GmvHourlyPoint[]>;
  distribution: Ref<GmvDistributionRow[]>;
  kpiDate: Ref<string>;
  todayText: string;
  backfilling: Ref<boolean>;
  trendMode: Ref<GmvTrendMode>;
  trendGranularity: Ref<GmvTrendGranularity>;
}) {
  const share = (part: 'gmvOnline' | 'gmvWallet') => {
    const k = params.kpi.value;
    if (!k || k.totalGmv === 0) return 0;
    return (k[part] / k.totalGmv) * 100;
  };

  return {
    backfillLabel: computed(() => (params.backfilling.value ? '抓取中...' : '历史回填')),
    kpiDateLabel: computed(() =>
      params.kpiDate.value === params.todayText ? '今日 GMV' : `${params.kpiDate.value} GMV`
    ),
    hourlyDateLabel: computed(() =>
      params.kpiDate.value === params.todayText ? '今天' : params.kpiDate.value
    ),
    totalGmvDisplay: computed(() => params.kpi.value?.totalGmv ?? 0),
    barGmvOnline: computed(() => share('gmvOnline')),
    barGmvWallet: computed(() => share('gmvWallet')),
    trendOption: computed(
      () =>
        buildGmvTrendOption(
          params.trend.value,
          params.trendMode.value,
          params.trendGranularity.value
        ) || {}
    ),
    hourlyOption: computed(() => buildGmvHourlyOption(params.hourly.value) || {}),
    distributionOption: computed(() => buildGmvDistributionOption(params.distribution.value) || {})
  };
}
