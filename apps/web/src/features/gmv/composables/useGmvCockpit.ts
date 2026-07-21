import { onMounted } from 'vue';
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

  onMounted(reload);

  return {
    ...state,
    ...derived,
    ...createGmvCockpitHandlers({ ...state, reload }),
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
