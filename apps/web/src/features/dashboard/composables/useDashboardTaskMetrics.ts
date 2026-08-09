import { onMounted, onScopeDispose, ref, type Ref } from 'vue';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

export interface DashboardTaskKpis {
  todayPending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  failed: number;
  todayTaskGmv: number;
}

function createInitialKpis(): DashboardTaskKpis {
  return {
    todayPending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    failed: 0,
    todayTaskGmv: 0
  };
}

export function useDashboardTaskMetrics(canViewPlatformKpis: Readonly<Ref<boolean>>) {
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const kpis = ref<DashboardTaskKpis>(createInitialKpis());
  let disposed = false;
  let requestId = 0;

  async function loadKPIs(): Promise<void> {
    if (disposed || !canViewPlatformKpis.value) return;

    const currentRequestId = ++requestId;
    loading.value = true;
    loadError.value = null;
    try {
      const data = await api.getTaskKPIs();
      if (disposed || currentRequestId !== requestId) return;
      kpis.value = data;
    } catch (error) {
      if (disposed || currentRequestId !== requestId) return;
      loadError.value = extractErrorMessage(error, '今日任务指标加载失败，请稍后重试');
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
    }
  }

  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
    loading.value = false;
  });

  onMounted(() => {
    void loadKPIs();
  });

  return { loading, loadError, kpis, loadKPIs };
}
