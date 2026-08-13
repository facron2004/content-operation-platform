import type { Ref } from 'vue';
import type {
  GmvDistributionRow,
  GmvHourlyPoint,
  GmvKpi,
  GmvMerchantRow,
  GmvTrendPoint
} from '../../../services/api/gmv.api';
import { type GmvTrendGranularity } from './gmv-chart-ui';
import {
  loadGmvDistribution,
  loadGmvHourly,
  loadGmvKpis,
  loadGmvTopMerchants,
  loadGmvTrend,
  type GmvAlertItem,
  type GmvCategoryRow,
  type GmvChannelRow,
  type GmvFunnelStage,
  type GmvRequestGuard
} from './gmv-cockpit-core';
import { loadGmvCockpitExtras } from './gmv-cockpit-extras';

export function createGmvCockpitLoadAll(state: {
  kpiDate: Ref<string>;
  kpi: Ref<GmvKpi | null>;
  loadError: Ref<string | null>;
  extrasError: Ref<string | null>;
  trendGranularity: Ref<GmvTrendGranularity>;
  trend: Ref<GmvTrendPoint[]>;
  hourly: Ref<GmvHourlyPoint[]>;
  distDim: Ref<'area' | 'category'>;
  distribution: Ref<GmvDistributionRow[]>;
  merchantSort: Ref<'gmvDesc' | 'refundDesc' | 'verifyDesc' | 'orderDesc'>;
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
  alerts: Ref<GmvAlertItem[]>;
}) {
  return async function loadAll(isCurrent: GmvRequestGuard = () => true) {
    if (!isCurrent()) return;
    // Full reload resets merchant page (sort/date/refresh).
    state.merchantPage.value = 1;
    await Promise.all([
      loadGmvKpis(state.kpiDate.value, state.kpi, state.loadError, isCurrent),
      loadGmvTrend(
        state.trendGranularity.value,
        state.kpiDate.value,
        state.trend,
        state.loadError,
        isCurrent
      ),
      loadGmvHourly(state.kpiDate.value, state.hourly, state.loadError, isCurrent),
      loadGmvDistribution(
        state.distDim.value,
        state.kpiDate.value,
        state.distribution,
        state.loadError,
        state.distributionTruncated,
        state.distributionLimit,
        state.distributionMatched,
        isCurrent
      ),
      loadGmvTopMerchants({
        sort: state.merchantSort.value,
        date: state.kpiDate.value,
        page: state.merchantPage.value,
        pageSize: state.merchantPageSize.value,
        topMerchants: state.topMerchants,
        hasMore: state.merchantHasMore,
        truncated: state.merchantTruncated,
        limit: state.merchantLimit,
        isCurrent,
        loadError: state.loadError
      })
    ]);
    if (!isCurrent()) return;
    await loadGmvCockpitExtras({
      date: state.kpiDate.value,
      kpi: state.kpi,
      extrasError: state.extrasError,
      categories: state.categories,
      channels: state.channels,
      funnel: state.funnel,
      alerts: state.alerts,
      isCurrent
    });
  };
}
