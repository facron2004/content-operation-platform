import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type {
  CampaignPerformanceResponse,
  DistributionTask,
  MarketingCampaign
} from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

const NESTED_TASKS_PAGE_SIZE = 10;

export function useCampaignDetail(campaignId: string) {
  const loading = ref(false);
  const actionLoading = ref(false);
  const campaign = ref<MarketingCampaign | null>(null);
  // Residual #178: campaign-scoped performance (not platform getTaskKPIs).
  const performance = ref<CampaignPerformanceResponse | null>(null);
  // Residual #187/#239: nested campaign tasks with pagination (was first page only).
  const tasks = ref<DistributionTask[]>([]);
  const tasksTotal = ref(0);
  const tasksPage = ref(1);
  const tasksPageSize = ref(NESTED_TASKS_PAGE_SIZE);
  const tasksLoading = ref(false);
  // Residual #271: listTasks INTERACTIVE_LIST_MAX_DAYS window honesty.
  const tasksDateFrom = ref<string | undefined>();
  const tasksDateTo = ref<string | undefined>();
  const tasksWindowLabel = computed(() => {
    if (tasksDateFrom.value && tasksDateTo.value) {
      return `${tasksDateFrom.value} ~ ${tasksDateTo.value}`;
    }
    return '近 90 天';
  });
  let tasksRequestId = 0;

  async function loadTasks(page = tasksPage.value): Promise<void> {
    if (!campaignId) return;
    const requestId = ++tasksRequestId;
    tasksLoading.value = true;
    try {
      const taskPage = await api.listTasks({
        campaignId,
        page,
        pageSize: tasksPageSize.value
      });
      if (requestId !== tasksRequestId) return;
      tasks.value = (taskPage.items ?? []) as DistributionTask[];
      tasksTotal.value = Number(taskPage.total ?? 0);
      tasksPage.value = page;
      tasksDateFrom.value = taskPage.dateFrom;
      tasksDateTo.value = taskPage.dateTo;
    } catch {
      if (requestId !== tasksRequestId) return;
      if (tasks.value.length === 0) {
        tasksTotal.value = 0;
      }
    } finally {
      if (requestId === tasksRequestId) tasksLoading.value = false;
    }
  }

  async function setTasksPage(page: number): Promise<void> {
    const next = Math.max(1, Math.floor(Number(page) || 1));
    if (next === tasksPage.value && tasks.value.length > 0) return;
    await loadTasks(next);
  }

  async function loadDetail(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    tasksLoading.value = true;
    const openTasksRequestId = ++tasksRequestId;
    try {
      const [campaignData, perfData, taskPage] = await Promise.all([
        api.getCampaign(campaignId),
        api.getCampaignPerformance(campaignId),
        api.listTasks({ campaignId, page: 1, pageSize: NESTED_TASKS_PAGE_SIZE }).catch(() => null)
      ]);
      campaign.value = campaignData as MarketingCampaign;
      performance.value = perfData;
      if (openTasksRequestId === tasksRequestId) {
        if (taskPage) {
          tasks.value = (taskPage.items ?? []) as DistributionTask[];
          tasksTotal.value = Number(taskPage.total ?? 0);
          tasksPage.value = 1;
          tasksDateFrom.value = taskPage.dateFrom;
          tasksDateTo.value = taskPage.dateTo;
        } else {
          tasks.value = [];
          tasksTotal.value = 0;
          tasksPage.value = 1;
          tasksDateFrom.value = undefined;
          tasksDateTo.value = undefined;
        }
      }
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, '加载活动详情失败'));
    } finally {
      loading.value = false;
      if (openTasksRequestId === tasksRequestId) tasksLoading.value = false;
    }
  }

  async function runAction(
    action: () => Promise<unknown>,
    successText: string,
    failText: string
  ): Promise<void> {
    if (actionLoading.value) return;
    actionLoading.value = true;
    try {
      // Residual #124: transition endpoints return the full campaign row.
      // Apply it directly — do not pay a second getCampaign + performance round-trip.
      // Performance is a trailing 90d aggregate and does not change on status transition;
      // loadDetail remains available for explicit refresh.
      const result = await action();
      if (result && typeof result === 'object' && result !== null && 'campaignId' in result) {
        campaign.value = result as MarketingCampaign;
      }
      ElMessage.success(successText);
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, failText));
    } finally {
      actionLoading.value = false;
    }
  }

  async function startCampaign(): Promise<void> {
    await runAction(() => api.startCampaign(campaignId), '活动已启动', '启动活动失败');
  }

  async function pauseCampaign(): Promise<void> {
    await runAction(() => api.pauseCampaign(campaignId), '活动已暂停', '暂停活动失败');
  }

  async function completeCampaign(): Promise<void> {
    await runAction(() => api.completeCampaign(campaignId), '活动已结束', '结束活动失败');
  }

  async function cancelCampaign(): Promise<void> {
    try {
      await ElMessageBox.confirm(
        `确认取消活动「${campaign.value?.name ?? ''}」？取消后不可恢复。`,
        '取消确认',
        { type: 'warning', confirmButtonText: '取消活动', cancelButtonText: '再想想' }
      );
    } catch {
      return;
    }
    await runAction(() => api.cancelCampaign(campaignId), '活动已取消', '取消活动失败');
  }

  onMounted(loadDetail);

  return {
    loading,
    actionLoading,
    campaign,
    performance,
    tasks,
    tasksTotal,
    tasksPage,
    tasksPageSize,
    tasksLoading,
    // Residual #271
    tasksDateFrom,
    tasksDateTo,
    tasksWindowLabel,
    loadDetail,
    setTasksPage,
    loadTasks,
    startCampaign,
    pauseCampaign,
    completeCampaign,
    cancelCampaign
  };
}
