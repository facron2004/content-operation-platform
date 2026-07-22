import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { DistributionTask, TaskKpiResponse } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { confirmAndDelete } from '../../../composables/useConfirmDelete';
import { usePagedList, type PagedListReturn } from '../../../composables/usePagedList';

export interface TaskFilters {
  status: string;
  channel: string;
  priority: string;
  campaignId: string;
  keyword: string;
}

const EMPTY_FILTERS: TaskFilters = {
  status: '',
  channel: '',
  priority: '',
  campaignId: '',
  keyword: ''
};

export function useTaskCenter(): PagedListReturn<DistributionTask, TaskFilters> & {
  kpis: typeof kpis;
  kpiLoading: typeof kpiLoading;
  loadKPIs: typeof loadKPIs;
  deleteTask: (task: DistributionTask) => Promise<void>;
} {
  const list = usePagedList<DistributionTask, TaskFilters>(
    async ({ page, pageSize, filters }) => {
      const data = await api.listTasks({
        status: filters.status || undefined,
        channel: filters.channel || undefined,
        priority: filters.priority || undefined,
        campaignId: filters.campaignId || undefined,
        keyword: filters.keyword || undefined,
        page,
        pageSize
      });
      return { items: data.items ?? [], total: data.total ?? 0 };
    },
    { ...EMPTY_FILTERS },
    {
      onError: (msg) => ElMessage.error(extractErrorMessage(msg, '加载任务列表失败'))
    }
  );

  const kpis = ref<TaskKpiResponse | null>(null);
  const kpiLoading = ref(false);

  async function loadKPIs() {
    kpiLoading.value = true;
    try {
      kpis.value = await api.getTaskKPIs();
    } catch (err) {
      kpis.value = null;
      ElMessage.error(extractErrorMessage(err, '加载任务指标失败'));
    } finally {
      kpiLoading.value = false;
    }
  }

  async function deleteTask(task: DistributionTask) {
    await confirmAndDelete(
      {
        message: `确定删除任务「${task.title || task.taskId}」吗?删除后不可恢复。`,
        title: '确认删除'
      },
      () => api.deleteTask(task.taskId),
      {
        successMsg: '任务已删除',
        errorMsg: '删除任务失败',
        onSuccess: async () => {
          await list.load();
          await loadKPIs();
        }
      }
    );
  }

  onMounted(() => {
    list.load();
    loadKPIs();
  });

  return { ...list, kpis, kpiLoading, loadKPIs, deleteTask };
}
