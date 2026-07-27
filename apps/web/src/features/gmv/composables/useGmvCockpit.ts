import { onActivated, onMounted } from 'vue';
import { createGmvCockpitState } from './gmv-cockpit-core';
import { refreshGmvCockpit } from './gmv-cockpit-core';
import {
  createGmvCockpitHandlers,
  createGmvCockpitLoadAll,
  useGmvCockpitDerived
} from './gmv-cockpit-ops';

export function useGmvCockpit() {
  const state = createGmvCockpitState();
  const derived = useGmvCockpitDerived({
    kpi: state.kpi,
    trend: state.trend,
    hourly: state.hourly,
    distribution: state.distribution,
    kpiDate: state.kpiDate,
    todayText: state.todayText,
    backfilling: state.backfilling,
    trendMode: state.trendMode,
    trendGranularity: state.trendGranularity
  });
  const loadAll = createGmvCockpitLoadAll(state);

  async function reload() {
    await refreshGmvCockpit({
      loading: state.loading,
      loadError: state.loadError,
      loadAll
    });
  }

  // 页面加载/缓存切回只加载本地数据（快、不限流）；拉 JeeSite 由用户点击「刷新」或「历史回填」触发
  onMounted(loadAll);
  onActivated(loadAll);

  return {
    ...state,
    ...derived,
    ...createGmvCockpitHandlers({ ...state, reload, loadAll }),
    reload
  };
}

export {
  formatCount,
  formatGmv,
  formatNumber,
  formatPercent,
  formatPercentRaw
} from '../../../utils/format';

export type {
  GmvActivityRow,
  GmvAlertItem,
  GmvCategoryRow,
  GmvChannelRow,
  GmvFunnelStage,
  GmvHeatPoint
} from './gmv-cockpit-core';

export type { GmvTrendGranularity, GmvTrendMode } from './gmv-chart-ui';
