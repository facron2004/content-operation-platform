import { onMounted } from 'vue';
import {
  buildUseSettingsReturn,
  createSettingsState,
  loadSettingsDefaults,
  runSettingsLoad
} from './settings-core';

export function useSettings() {
  const state = createSettingsState();
  async function load() {
    await runSettingsLoad({
      loading: state.loading,
      rules: state.rules,
      total: state.total,
      page: state.page.value,
      pageSize: state.pageSize.value,
      filters: state.filters
    });
  }
  onMounted(() => {
    loadSettingsDefaults(state.defaults);
    load();
  });
  return buildUseSettingsReturn(state, load);
}
