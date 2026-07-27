import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
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
  const community = ref<CommunityGroupEntity | null>(null);
  const performance = ref<CommunityPerformanceResponse | null>(null);
  // Residual #186/#239: nested task list for this community (paginated, soft-fail).
  const tasks = ref<DistributionTask[]>([]);
  const tasksTotal = ref(0);
  const tasksPage = ref(1);
  const tasksPageSize = ref(NESTED_TASKS_PAGE_SIZE);
  const tasksLoading = ref(false);
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
  // Drop stale page responses when the drawer re-opens or pages race.
  let tasksRequestId = 0;

  async function loadTasks(groupId: string, page = tasksPage.value): Promise<void> {
    if (!groupId) return;
    const requestId = ++tasksRequestId;
    tasksLoading.value = true;
    try {
      const taskPage = await api.getCommunityTasks(groupId, {
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
    community.value = row;
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
    try {
      // Prefer fresh GET for detail fields that list may omit; fall back to row on error.
      // Tasks + packages soft-fail independently so performance still shows when they error.
      const [detail, perf, taskPage, recs] = await Promise.all([
        api.getCommunity(row.groupId).catch(() => row),
        api.getCommunityPerformance(row.groupId),
        api
          .getCommunityTasks(row.groupId, { page: 1, pageSize: NESTED_TASKS_PAGE_SIZE })
          .catch(() => null),
        api.getCommunityRecommendations(row.groupId).catch(() => null)
      ]);
      community.value = (detail as CommunityGroupEntity) ?? row;
      performance.value = perf;
      if (openTasksRequestId === tasksRequestId && taskPage) {
        tasks.value = (taskPage.items ?? []) as DistributionTask[];
        tasksTotal.value = Number(taskPage.total ?? 0);
        tasksPage.value = 1;
        tasksDateFrom.value = taskPage.dateFrom;
        tasksDateTo.value = taskPage.dateTo;
      }
      // Prefer top-level packages; fall back to group.todayRecommendedPackages if present.
      if (recs) {
        const fromTop = Array.isArray(recs.packages) ? (recs.packages as OperationCard[]) : null;
        const fromGroup = Array.isArray(recs.group?.todayRecommendedPackages)
          ? (recs.group.todayRecommendedPackages as OperationCard[])
          : null;
        packages.value = (fromTop ?? fromGroup ?? []) as RecommendedPackages;
      }
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, '加载社群详情失败'));
    } finally {
      loading.value = false;
      if (openTasksRequestId === tasksRequestId) tasksLoading.value = false;
      packagesLoading.value = false;
    }
  }

  function close(): void {
    drawerVisible.value = false;
  }

  return {
    drawerVisible,
    loading,
    community,
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
    packages,
    packagesLoading,
    open,
    close,
    setTasksPage,
    loadTasks
  };
}
