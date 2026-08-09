import { onMounted, onScopeDispose } from 'vue';
import { buildUseSettingsReturn } from './settings-write';
import { createSettingsState, loadSettingsDefaults, runSettingsLoad } from './settings-read';

export function useSettings() {
  const state = createSettingsState();
  let disposed = false;
  let rulesRequestId = 0;
  let defaultsRequestId = 0;

  const isActive = () => !disposed;

  async function load() {
    if (disposed) return;
    const requestId = ++rulesRequestId;
    await runSettingsLoad({
      loading: state.loading,
      loadError: state.loadError,
      rules: state.rules,
      total: state.total,
      page: state.page.value,
      pageSize: state.pageSize.value,
      filters: state.filters,
      isCurrent: () => !disposed && requestId === rulesRequestId
    });
  }

  async function loadDefaults() {
    if (disposed) return;
    const requestId = ++defaultsRequestId;
    await loadSettingsDefaults(
      state.defaults,
      () => !disposed && requestId === defaultsRequestId,
      state.defaultsError
    );
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    rulesRequestId += 1;
    defaultsRequestId += 1;
    state.loading.value = false;
    state.submitting.value = false;
    state.mutating.value = false;
    state.writeError.value = null;
  }

  onMounted(() => {
    void loadDefaults();
    void load();
  });
  onScopeDispose(dispose, true);
  return buildUseSettingsReturn(state, load, isActive);
}
