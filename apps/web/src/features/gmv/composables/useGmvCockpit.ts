import { onActivated, onMounted, onScopeDispose } from 'vue';
import { createGmvCockpitState } from './gmv-cockpit-core';
import { refreshGmvCockpit } from './gmv-cockpit-core';
import {
  createGmvCockpitHandlers,
  createGmvCockpitLoadAll,
  useGmvCockpitDerived
} from './gmv-cockpit-ops';

export function useGmvCockpit() {
  const state = createGmvCockpitState();
  let disposed = false;
  let requestSeq = 0;
  const beginRequest = () => ++requestSeq;
  const isAlive = () => !disposed;
  const isRequestCurrent = (requestId: number) => !disposed && requestId === requestSeq;
  const derived = useGmvCockpitDerived({
    kpi: state.kpi,
    trend: state.trend,
    hourly: state.hourly,
    distribution: state.distribution,
    kpiDate: state.kpiDate,
    todayText: state.todayText,
    backfilling: state.backfilling,
    backfillStatusText: state.backfillStatusText,
    trendMode: state.trendMode,
    trendGranularity: state.trendGranularity
  });
  const loadAllImpl = createGmvCockpitLoadAll(state);

  async function loadAll() {
    const requestId = beginRequest();
    if (!isRequestCurrent(requestId)) return;
    await loadAllImpl(() => isRequestCurrent(requestId));
  }

  async function reload() {
    if (!isAlive()) return;
    // Refresh owns a long-running job; invalidate older view reads first.
    beginRequest();
    await refreshGmvCockpit({
      loading: state.loading,
      statusText: state.backfillStatusText,
      loadError: state.loadError,
      kpiDate: state.kpiDate,
      loadAll,
      isCurrent: isAlive
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    requestSeq += 1;
    state.loading.value = false;
    state.backfilling.value = false;
    state.backfillStatusText.value = '';
  }

  onScopeDispose(dispose);
  // 页面加载/缓存切回只加载本地数据（快、不限流）；拉 JeeSite 由用户点击「刷新」或「历史回填」触发
  onMounted(() => void loadAll());
  onActivated(() => void loadAll());

  return {
    ...state,
    ...derived,
    ...createGmvCockpitHandlers({
      ...state,
      reload,
      loadAll,
      beginRequest,
      isRequestCurrent,
      isAlive
    }),
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
