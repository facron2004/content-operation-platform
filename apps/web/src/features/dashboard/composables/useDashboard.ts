import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { localDateKey } from '@content/shared';
import { api, type ConsoleResponse } from '../../../services/api';
import { clearDashboardCache } from '../../../services/cache.service';
import { extractErrorMessage } from '../../../services/http-client';
import {
  emptyConsoleData,
  mapConsoleResponse,
  type OperationConsoleData
} from './dashboard-console';

export type { ConsoleSummary, CommunityTask, OperationConsoleData } from './dashboard-console';

export function useDashboard(role: Ref<string | undefined>) {
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const consoleData = ref<OperationConsoleData>(emptyConsoleData);
  const activeFocus = ref('all');
  const requestId = ref(0);
  let disposed = false;
  const summary = computed(() => consoleData.value.summary);
  const todayText = computed(() => localDateKey(new Date()));
  onScopeDispose(() => {
    disposed = true;
    requestId.value += 1;
    loading.value = false;
  }, true);
  const load = async (force = false) => {
    if (disposed) return;
    const currentRequestId = ++requestId.value;
    loading.value = true;
    loadError.value = null;
    try {
      if (force) clearDashboardCache();
      const response = (await api.getTodayOperationConsole({
        role: role.value
      })) as ConsoleResponse;
      if (disposed || currentRequestId !== requestId.value) return;
      consoleData.value = mapConsoleResponse(response);
    } catch (err) {
      if (disposed || currentRequestId !== requestId.value) return;
      loadError.value = extractErrorMessage(
        err,
        '作战台数据加载失败，请稍后重试；如反复出现请重新登录'
      );
      consoleData.value = emptyConsoleData;
    } finally {
      if (!disposed && currentRequestId === requestId.value) loading.value = false;
    }
  };
  watch(role, () => {
    void load(true);
  });
  return { loading, loadError, consoleData, activeFocus, summary, todayText, load };
}
