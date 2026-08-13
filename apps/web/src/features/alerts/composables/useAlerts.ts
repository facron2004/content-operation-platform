import { computed, onScopeDispose, type Ref } from 'vue';
import { useOperationHistory } from '../../../services/operation-history';
import {
  bindAlertWatchers,
  clearAlertFilterTimer,
  createAlertLoader,
  createAlertState
} from './alert-core';
import { useAlertHandlers } from './alert-handlers';
import { EMPTY_ALERT_SUMMARY } from './alert-types';

export type { AlertSummary, AlertPackageFocus, AlertItem, AlertResponse } from './alert-types';
export { useAlertTableSummary } from './alert-summary';

export function useAlerts(role: Ref<string | undefined>, canResolve: Ref<boolean>) {
  const state = createAlertState();
  let disposed = false;
  const { recordSuccess, recordError } = useOperationHistory();
  const summary = computed(() => state.alertResponse.value?.summary ?? EMPTY_ALERT_SUMMARY);
  const topPackages = computed(() => state.alertResponse.value?.topPackages ?? []);
  // Residual #283: Top-N focus package head honesty.
  const focusPackageTruncated = computed(
    () => state.alertResponse.value?.focusPackageTruncated === true
  );
  const focusPackageLimit = computed(() => state.alertResponse.value?.focusPackageLimit ?? 0);
  const focusPackageMatched = computed(() => state.alertResponse.value?.focusPackageMatched ?? 0);
  // Residual #274: surface silent RESOLVED_ALERT_DAY_LIMIT clip.
  const resolvedIdsTruncated = computed(
    () => state.alertResponse.value?.resolvedIdsTruncated === true
  );
  const resolvedIdsLimit = computed(() => state.alertResponse.value?.resolvedIdsLimit ?? 0);
  const resolvedIdsLoaded = computed(() => state.alertResponse.value?.resolvedIdsLoaded ?? 0);
  // Residual #275: surface RECOMMEND_CACHE_CAP source undercount.
  const sourceTruncated = computed(() => state.alertResponse.value?.sourceTruncated === true);
  const sourceLimit = computed(() => state.alertResponse.value?.sourceLimit ?? 0);
  const sourceMatchedCount = computed(() => state.alertResponse.value?.sourceMatchedCount ?? 0);
  const rawLoad = createAlertLoader(state, role);
  const load = async (force = false) => {
    if (disposed) return;
    await rawLoad(force);
  };
  const handlers = useAlertHandlers({
    alerts: state.alerts,
    filters: state.filters,
    pagination: state.pagination,
    load,
    resolveRequestId: () => ++state.resolveRequestId.value,
    currentResolveRequestId: () => state.resolveRequestId.value,
    isActive: () => !disposed,
    canResolve: () => canResolve.value,
    setResolving: (v) => {
      state.resolving.value = v;
    },
    recordSuccess,
    recordError,
    setActionError: (value) => {
      state.actionError.value = value;
    }
  });

  bindAlertWatchers({
    filters: state.filters,
    pagination: state.pagination,
    isActive: () => !disposed,
    role,
    load,
    setFilterTimer: (timer) => {
      state.filterTimer.value = timer;
    },
    getFilterTimer: () => state.filterTimer.value
  });

  onScopeDispose(() => {
    disposed = true;
    clearAlertFilterTimer(state);
    state.loadRequestId.value += 1;
    state.resolveRequestId.value += 1;
    state.loading.value = false;
    state.resolving.value = false;
  }, true);

  return {
    loading: state.loading,
    resolving: state.resolving,
    loadError: state.loadError,
    actionError: state.actionError,
    alerts: state.alerts,
    summary,
    topPackages,
    // Residual #283
    focusPackageTruncated,
    focusPackageLimit,
    focusPackageMatched,
    // Residual #274
    resolvedIdsTruncated,
    resolvedIdsLimit,
    resolvedIdsLoaded,
    // Residual #275
    sourceTruncated,
    sourceLimit,
    sourceMatchedCount,
    filters: state.filters,
    pagination: state.pagination,
    load,
    ...handlers
  };
}
