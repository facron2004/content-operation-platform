import { computed, onBeforeUnmount, type Ref } from 'vue';
import { useOperationHistory } from '../../../services/operation-history';
import {
  EMPTY_ALERT_SUMMARY,
  bindAlertWatchers,
  createAlertLoader,
  createAlertState,
  useAlertHandlers
} from './alert-core';

export type { AlertSummary, AlertPackageFocus, AlertItem, AlertResponse } from './alert-core';
export { useAlertTableSummary } from './alert-core';

export function useAlerts(role: Ref<string | undefined>) {
  const state = createAlertState();
  const { recordSuccess, recordError } = useOperationHistory();
  const summary = computed(() => state.alertResponse.value?.summary ?? EMPTY_ALERT_SUMMARY);
  const topPackages = computed(() => state.alertResponse.value?.topPackages ?? []);
  const load = createAlertLoader(state, role);
  const handlers = useAlertHandlers({
    alerts: state.alerts,
    filters: state.filters,
    pagination: state.pagination,
    load,
    resolveRequestId: () => ++state.resolveRequestId.value,
    currentResolveRequestId: () => state.resolveRequestId.value,
    setResolving: (v) => {
      state.resolving.value = v;
    },
    recordSuccess,
    recordError
  });

  bindAlertWatchers({
    filters: state.filters,
    pagination: state.pagination,
    role,
    load,
    setFilterTimer: (timer) => {
      state.filterTimer.value = timer;
    },
    getFilterTimer: () => state.filterTimer.value
  });

  onBeforeUnmount(() => {
    if (state.filterTimer.value) clearTimeout(state.filterTimer.value);
    state.loadRequestId.value += 1;
    state.resolveRequestId.value += 1;
  });

  return {
    loading: state.loading,
    resolving: state.resolving,
    loadError: state.loadError,
    alerts: state.alerts,
    summary,
    topPackages,
    filters: state.filters,
    pagination: state.pagination,
    load,
    ...handlers
  };
}
