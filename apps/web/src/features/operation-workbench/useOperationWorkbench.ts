import { computed, onMounted, onScopeDispose, ref } from 'vue';
import { useRouter } from 'vue-router';
import { beijingDateKey } from '@content/shared';
import {
  getOperationWorkbench,
  type OperationWorkbenchResponse,
  type WorkbenchPendingItem
} from '../../services/api/operation-workbench.api';
import { extractErrorMessage } from '../../services/http-client';
import { displayMoney, formatCount, formatPercent } from '../../utils/format';
import { buildOperationTrendOption } from './operation-workbench-chart';

export function useOperationWorkbench() {
  const router = useRouter();
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const workbench = ref<OperationWorkbenchResponse | null>(null);
  const businessDate = ref(beijingDateKey());
  let disposed = false;
  let requestId = 0;

  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
    loading.value = false;
  });

  async function reload() {
    if (disposed) return;
    const currentRequestId = ++requestId;
    loading.value = true;
    loadError.value = null;
    try {
      const next = await getOperationWorkbench(businessDate.value || undefined);
      if (!disposed && currentRequestId === requestId) workbench.value = next;
    } catch (error) {
      if (!disposed && currentRequestId === requestId) {
        loadError.value = extractErrorMessage(error, '经营工作台加载失败');
      }
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
    }
  }

  function goPending(item: WorkbenchPendingItem) {
    void router.push(item.route);
  }

  onMounted(() => void reload());

  return {
    loading,
    loadError,
    workbench,
    businessDate,
    trendOption: computed(() => buildOperationTrendOption(workbench.value?.trend ?? [])),
    displayMoney,
    formatCount,
    formatPercent,
    reload,
    goPending
  };
}
