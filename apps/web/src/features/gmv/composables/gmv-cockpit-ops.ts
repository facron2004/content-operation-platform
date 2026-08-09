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
import type { GmvBackfillRange } from './gmv-cockpit-core';

export { createGmvCockpitLoadAll } from './gmv-cockpit-load';

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
  extrasError: Ref<string | null>;
  todayText: string;
  backfilling: Ref<boolean>;
  backfillStatusText: Ref<string>;
  reload: () => Promise<void>;
  loadAll: () => Promise<void>;
  categories: Ref<GmvCategoryRow[]>;
  channels: Ref<GmvChannelRow[]>;
  funnel: Ref<GmvFunnelStage[]>;
  activities: Ref<GmvActivityRow[]>;
  heatPoints: Ref<GmvHeatPoint[]>;
  heatCity: Ref<string>;
  alerts: Ref<GmvAlertItem[]>;
  beginRequest: () => number;
  isRequestCurrent: (requestId: number) => boolean;
  isAlive: () => boolean;
};

export function createGmvCockpitHandlers(args: GmvCockpitHandlerArgs) {
  async function loadTopMerchants(resetPage = false) {
    if (!args.isAlive()) return;
    if (resetPage) args.merchantPage.value = 1;
    const requestId = args.beginRequest();
    const isCurrent = () => args.isRequestCurrent(requestId);
    if (!isCurrent()) return;
    await loadGmvTopMerchants({
      sort: args.merchantSort.value,
      page: args.merchantPage.value,
      pageSize: args.merchantPageSize.value,
      topMerchants: args.topMerchants,
      hasMore: args.merchantHasMore,
      truncated: args.merchantTruncated,
      limit: args.merchantLimit,
      isCurrent,
      loadError: args.loadError
    });
  }
  return {
    disableFutureDate: (date: Date) => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return date.getTime() > today.getTime();
    },
    loadTrend: async () => {
      const requestId = args.beginRequest();
      const isCurrent = () => args.isRequestCurrent(requestId);
      if (!isCurrent()) return;
      await loadGmvTrend(
        args.trendGranularity.value,
        args.kpiDate.value,
        args.trend,
        args.loadError,
        isCurrent
      );
    },
    loadHourly: async () => {
      const requestId = args.beginRequest();
      const isCurrent = () => args.isRequestCurrent(requestId);
      if (!isCurrent()) return;
      await loadGmvHourly(args.kpiDate.value, args.hourly, args.loadError, isCurrent);
    },
    loadDistribution: async () => {
      const requestId = args.beginRequest();
      const isCurrent = () => args.isRequestCurrent(requestId);
      if (!isCurrent()) return;
      await loadGmvDistribution(
        args.distDim.value,
        args.distribution,
        args.loadError,
        args.distributionTruncated,
        args.distributionLimit,
        args.distributionMatched,
        isCurrent
      );
    },
    // Sort change resets to page 1.
    loadTopMerchants: () => loadTopMerchants(true),
    prevMerchantPage() {
      if (!args.isAlive()) return;
      if (args.merchantPage.value > 1) {
        args.merchantPage.value -= 1;
        void loadTopMerchants(false);
      }
    },
    nextMerchantPage() {
      if (!args.isAlive()) return;
      if (args.merchantHasMore.value) {
        args.merchantPage.value += 1;
        void loadTopMerchants(false);
      }
    },
    onKpiDateChange: async () => {
      const requestId = args.beginRequest();
      const isCurrent = () => args.isRequestCurrent(requestId);
      if (!isCurrent()) return;
      await Promise.all([
        loadGmvKpis(args.kpiDate.value, args.kpi, args.loadError, isCurrent),
        loadGmvTrend(
          args.trendGranularity.value,
          args.kpiDate.value,
          args.trend,
          args.loadError,
          isCurrent
        ),
        loadGmvHourly(args.kpiDate.value, args.hourly, args.loadError, isCurrent)
      ]);
      if (!isCurrent()) return;
      // KPI 变了之后重算支付构成 / 漏斗 / 预警
      await loadGmvCockpitExtras({
        kpi: args.kpi,
        extrasError: args.extrasError,
        categories: args.categories,
        channels: args.channels,
        funnel: args.funnel,
        activities: args.activities,
        heatPoints: args.heatPoints,
        heatCity: args.heatCity,
        alerts: args.alerts,
        isCurrent
      });
    },
    onBackfillCommand: (days: number) => {
      if (!args.isAlive()) return;
      // A long-running backfill invalidates older view loads, but keeps its
      // own lifecycle guard so it can refresh the page once done.
      args.beginRequest();
      return backfillGmvHistory({
        todayText: args.todayText,
        days,
        backfilling: args.backfilling,
        statusText: args.backfillStatusText,
        loadError: args.loadError,
        kpiDate: args.kpiDate,
        loadAll: args.loadAll,
        isCurrent: args.isAlive
      });
    },
    onBackfillDate: (range: GmvBackfillRange) => {
      if (!args.isAlive()) return;
      // 按日期区间回填：回填 [startDate, endDate] 区间全部订单并重算汇总。
      // 复用同一套幂等拉单 + 重算流程，回填后切到结束日期并刷新看板。
      args.beginRequest();
      return backfillGmvHistory({
        todayText: args.todayText,
        startDate: range.startDate,
        endDate: range.endDate,
        backfilling: args.backfilling,
        statusText: args.backfillStatusText,
        loadError: args.loadError,
        kpiDate: args.kpiDate,
        loadAll: args.loadAll,
        isCurrent: args.isAlive
      });
    }
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
  backfillStatusText: Ref<string>;
  trendMode: Ref<GmvTrendMode>;
  trendGranularity: Ref<GmvTrendGranularity>;
}) {
  const share = (part: 'gmvOnline' | 'gmvWallet') => {
    const k = params.kpi.value;
    if (!k || k.totalGmv === 0) return 0;
    return (k[part] / k.totalGmv) * 100;
  };

  return {
    backfillLabel: computed(() =>
      params.backfilling.value ? params.backfillStatusText.value || '抓取中...' : '历史回填'
    ),
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
