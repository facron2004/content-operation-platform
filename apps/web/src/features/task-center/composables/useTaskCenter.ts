import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { DistributionTask, TaskKpiResponse } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

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

export function useTaskCenter() {
  const loading = ref(false);
  const tasks = ref<DistributionTask[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const kpis = ref<TaskKpiResponse | null>(null);
  const kpiLoading = ref(false);

  const filters = ref<TaskFilters>({ ...EMPTY_FILTERS });

  function filterProxy<K extends keyof TaskFilters>(key: K) {
    return computed<TaskFilters[K]>({
      get: () => filters.value[key],
      set: (value) => {
        filters.value = { ...filters.value, [key]: value };
      }
    });
  }

  const status = filterProxy('status');
  const channel = filterProxy('channel');
  const priority = filterProxy('priority');
  const campaignId = filterProxy('campaignId');
  const keyword = filterProxy('keyword');

  const pagination = computed(() => ({
    current: page.value,
    pageSize: pageSize.value,
    total: total.value
  }));

  async function loadTasks() {
    loading.value = true;
    try {
      const data = await api.listTasks({
        status: filters.value.status || undefined,
        channel: filters.value.channel || undefined,
        priority: filters.value.priority || undefined,
        campaignId: filters.value.campaignId || undefined,
        keyword: filters.value.keyword || undefined,
        page: page.value,
        pageSize: pageSize.value
      });
      tasks.value = data.items ?? [];
      total.value = data.total ?? 0;
    } catch (err) {
      tasks.value = [];
      total.value = 0;
      ElMessage.error(extractErrorMessage(err, '加载任务列表失败'));
    } finally {
      loading.value = false;
    }
  }

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

  function setPage(value: number) {
    page.value = value;
    void loadTasks();
  }

  function setPageSize(value: number) {
    pageSize.value = value;
    page.value = 1;
    void loadTasks();
  }

  function search() {
    page.value = 1;
    void loadTasks();
  }

  async function refresh() {
    page.value = 1;
    await Promise.all([loadTasks(), loadKPIs()]);
  }

  async function deleteTask(task: DistributionTask) {
    try {
      await ElMessageBox.confirm(
        `确定删除任务「${task.title || task.taskId}」吗?删除后不可恢复。`,
        '确认删除',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      );
    } catch {
      return;
    }
    try {
      await api.deleteTask(task.taskId);
      ElMessage.success('任务已删除');
      void loadTasks();
      void loadKPIs();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '删除任务失败'));
    }
  }

  function handleSearch() {
    void refresh();
  }

  onMounted(() => {
    void loadTasks();
    void loadKPIs();
  });

  return {
    loading,
    tasks,
    total,
    page,
    pageSize,
    pagination,
    kpis,
    kpiLoading,
    filters,
    status,
    channel,
    priority,
    campaignId,
    keyword,
    setPage,
    setPageSize,
    search,
    refresh,
    deleteTask,
    handleDelete: deleteTask,
    handleSearch,
    loadTasks,
    loadKPIs
  };
}
