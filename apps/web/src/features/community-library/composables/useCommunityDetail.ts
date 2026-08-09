import { computed, ref } from 'vue';
import type {
  CommunityGroup,
  CommunityGroupEntity,
  CommunityPerformanceResponse,
  DistributionTask,
  OperationCard
} from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

type RecommendedPackages = CommunityGroup['todayRecommendedPackages'];

const NESTED_TASKS_PAGE_SIZE = 10;

/**
 * Residual #179: community detail drawer state.
 * Residual #186: also load nested community tasks (API + client existed unused).
 * Residual #209: also load todayRecommendedPackages via getCommunityRecommendations.
 * Residual #239: nested tasks pagination (was first page only).
 * Residual #271: nested tasks INTERACTIVE_LIST_MAX_DAYS window honesty.
 */
export function useCommunityDetail() {
  const drawerVisible = ref(false);
  const loading = ref(false);
  const detailError = ref<string | null>(null);
  const performanceError = ref<string | null>(null);
  const community = ref<CommunityGroupEntity | null>(null);
  const performance = ref<CommunityPerformanceResponse | null>(null);
  // Residual #186/#239: nested task list for this community (paginated, soft-fail).
  const tasks = ref<DistributionTask[]>([]);
  const tasksTotal = ref(0);
  const tasksPage = ref(1);
  const tasksPageSize = ref(NESTED_TASKS_PAGE_SIZE);
  const tasksLoading = ref(false);
  const tasksError = ref<string | null>(null);
  // Residual #271: window from getCommunityTasks pagination.
  const tasksDateFrom = ref<string | undefined>();
  const tasksDateTo = ref<string | undefined>();
  const tasksWindowLabel = computed(() => {
    if (tasksDateFrom.value && tasksDateTo.value) {
      return `${tasksDateFrom.value} ~ ${tasksDateTo.value}`;
    }
    return '近 90 天';
  });
  // Residual #209: content-console recommendations (OperationCard[]), soft-fail.
  const packages = ref<RecommendedPackages>([]);
  const packagesLoading = ref(false);
  const packagesError = ref<string | null>(null);
  // Drop stale page responses when the drawer re-opens or pages race.
  let tasksRequestId = 0;
  let detailRequestId = 0;

  const isCurrentDetail = (requestId: number) =>
    drawerVisible.value && requestId === detailRequestId;

  async function loadTasks(groupId: string, page = tasksPage.value): Promise<void> {
    if (!groupId) return;
    const requestId = ++tasksRequestId;
    const detailRequest = detailRequestId;
    tasksLoading.value = true;
    tasksError.value = null;
    try {
      const taskPage = await api.getCommunityTasks(groupId, {
        page,
        pageSize: tasksPageSize.value
      });
      if (requestId !== tasksRequestId || !isCurrentDetail(detailRequest)) return;
      tasks.value = (taskPage.items ?? []) as DistributionTask[];
      tasksTotal.value = Number(taskPage.total ?? 0);
      tasksPage.value = page;
      tasksDateFrom.value = taskPage.dateFrom;
      tasksDateTo.value = taskPage.dateTo;
    } catch (error) {
      if (requestId !== tasksRequestId || !isCurrentDetail(detailRequest)) return;
      tasksError.value = extractErrorMessage(error, '社群任务加载失败，请稍后重试');
      // Soft-fail: keep previous page if any; clear only when empty.
      if (tasks.value.length === 0) {
        tasksTotal.value = 0;
      }
    } finally {
      if (requestId === tasksRequestId) tasksLoading.value = false;
    }
  }

  async function setTasksPage(page: number): Promise<void> {
    const groupId = community.value?.groupId;
    if (!groupId) return;
    const next = Math.max(1, Math.floor(Number(page) || 1));
    if (next === tasksPage.value && tasks.value.length > 0) return;
    await loadTasks(groupId, next);
  }

  async function open(row: CommunityGroupEntity): Promise<void> {
    const requestId = ++detailRequestId;
    community.value = row;
    detailError.value = null;
    performanceError.value = null;
    tasksError.value = null;
    packagesError.value = null;
    performance.value = null;
    tasks.value = [];
    tasksTotal.value = 0;
    tasksPage.value = 1;
    tasksDateFrom.value = undefined;
    tasksDateTo.value = undefined;
    packages.value = [];
    drawerVisible.value = true;
    loading.value = true;
    tasksLoading.value = true;
    packagesLoading.value = true;
    // Invalidate any in-flight page from a previous open.
    const openTasksRequestId = ++tasksRequestId;
    const [detailResult, performanceResult, tasksResult, packagesResult] = await Promise.allSettled(
      [
        api.getCommunity(row.groupId),
        api.getCommunityPerformance(row.groupId),
        api.getCommunityTasks(row.groupId, {
          page: 1,
          pageSize: NESTED_TASKS_PAGE_SIZE
        }),
        api.getCommunityRecommendations(row.groupId)
      ]
    );
    if (!isCurrentDetail(requestId)) return;
    if (detailResult.status === 'fulfilled') {
      community.value = (detailResult.value as CommunityGroupEntity) ?? row;
    } else {
      detailError.value = extractErrorMessage(detailResult.reason, '社群详情读取失败，请稍后重试');
    }
    if (performanceResult.status === 'fulfilled') {
      performance.value = performanceResult.value;
    } else {
      performanceError.value = extractErrorMessage(
        performanceResult.reason,
        '社群表现加载失败，请稍后重试'
      );
    }
    if (tasksResult.status === 'fulfilled') {
      const taskPage = tasksResult.value;
      tasks.value = (taskPage.items ?? []) as DistributionTask[];
      tasksTotal.value = Number(taskPage.total ?? 0);
      tasksPage.value = 1;
      tasksDateFrom.value = taskPage.dateFrom;
      tasksDateTo.value = taskPage.dateTo;
    } else if (openTasksRequestId === tasksRequestId) {
      tasksError.value = extractErrorMessage(tasksResult.reason, '社群任务加载失败，请稍后重试');
    }
    if (packagesResult.status === 'fulfilled') {
      const recs = packagesResult.value;
      const fromTop = Array.isArray(recs.packages) ? (recs.packages as OperationCard[]) : null;
      const fromGroup = Array.isArray(recs.group?.todayRecommendedPackages)
        ? (recs.group.todayRecommendedPackages as OperationCard[])
        : null;
      packages.value = (fromTop ?? fromGroup ?? []) as RecommendedPackages;
    } else {
      packagesError.value = extractErrorMessage(
        packagesResult.reason,
        '社群推荐套餐加载失败，请稍后重试'
      );
    }
    loading.value = false;
    if (openTasksRequestId === tasksRequestId) tasksLoading.value = false;
    packagesLoading.value = false;
  }

  function close(): void {
    detailRequestId += 1;
    tasksRequestId += 1;
    drawerVisible.value = false;
    loading.value = false;
    tasksLoading.value = false;
    packagesLoading.value = false;
  }

  return {
    drawerVisible,
    loading,
    detailError,
    community,
    performance,
    performanceError,
    tasks,
    tasksTotal,
    tasksPage,
    tasksPageSize,
    tasksLoading,
    tasksError,
    // Residual #271
    tasksDateFrom,
    tasksDateTo,
    tasksWindowLabel,
    packages,
    packagesLoading,
    packagesError,
    open,
    close,
    setTasksPage,
    loadTasks
  };
}
