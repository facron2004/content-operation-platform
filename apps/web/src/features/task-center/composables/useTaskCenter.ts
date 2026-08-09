import { computed, onMounted, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
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
  // Residual #188: groupId link-out from community detail (API already filters).
  groupId: string;
  // Residual #247: exact packageId filter (was keyword misuse).
  packageId: string;
  // Residual #197: assigneeId already on TaskQueryDto + listTasks client.
  assigneeId: string;
  keyword: string;
  // Residual #201: createdAt window + overdue / hasAttribution flags (API-ready).
  dateFrom: string;
  dateTo: string;
  /** UI boolean; coerced to 0|1 before listTasks. */
  overdue?: boolean;
  hasAttribution?: boolean;
}

const EMPTY_FILTERS: TaskFilters = {
  status: '',
  channel: '',
  priority: '',
  campaignId: '',
  groupId: '',
  packageId: '',
  assigneeId: '',
  keyword: '',
  dateFrom: '',
  dateTo: '',
  overdue: undefined,
  hasAttribution: undefined
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Residual #188: seed list filters from route.query (campaign/community detail link-outs).
 * Residual #206: also honor status / overdue deep-links from dashboard KPI tiles.
 * Residual #248: dateFrom / dateTo / hasAttribution round-trip (#201 filter surface).
 */
function filtersFromRouteQuery(query: Record<string, unknown>): Partial<TaskFilters> {
  const seed: Partial<TaskFilters> = {};
  const campaignId = typeof query.campaignId === 'string' ? query.campaignId.trim() : '';
  const groupId = typeof query.groupId === 'string' ? query.groupId.trim() : '';
  const packageId = typeof query.packageId === 'string' ? query.packageId.trim() : '';
  // Residual #197: optional deep-link assigneeId.
  const assigneeId = typeof query.assigneeId === 'string' ? query.assigneeId.trim() : '';
  const status = typeof query.status === 'string' ? query.status.trim() : '';
  const dateFrom = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
  const dateTo = typeof query.dateTo === 'string' ? query.dateTo.trim() : '';
  if (campaignId) seed.campaignId = campaignId;
  if (groupId) seed.groupId = groupId;
  if (assigneeId) seed.assigneeId = assigneeId;
  // Residual #247: dedicated packageId filter (no longer misuses keyword).
  if (packageId) seed.packageId = packageId;
  // Residual #206: dashboard / external deep-links.
  if (status) seed.status = status;
  // Residual #248: shareable date window (YYYY-MM-DD only; invalid values ignored).
  if (dateFrom && DATE_KEY_RE.test(dateFrom)) seed.dateFrom = dateFrom;
  if (dateTo && DATE_KEY_RE.test(dateTo)) seed.dateTo = dateTo;
  // overdue=1 → plannedAt-past scheduled filter (#201); distinct from status=overdue.
  if (query.overdue === '1' || query.overdue === 1) seed.overdue = true;
  // Residual #248: hasAttribution=1 → EXISTS OrderAttribution (#201).
  if (query.hasAttribution === '1' || query.hasAttribution === 1) seed.hasAttribution = true;
  return seed;
}

/** Residual #206: KPI tile → list filter mapping (mirrors getTaskKpi CASE arms). */
export type TaskKpiFilterKey = 'todayPending' | 'inProgress' | 'completed' | 'overdue' | 'failed';

const KPI_STATUS_MAP: Record<TaskKpiFilterKey, string> = {
  // getTaskKpi: scheduled → todayPending, published → inProgress, …
  todayPending: 'scheduled',
  inProgress: 'published',
  completed: 'completed',
  overdue: 'overdue',
  failed: 'failed'
};

export function useTaskCenter(): PagedListReturn<DistributionTask, TaskFilters> & {
  tasks: PagedListReturn<DistributionTask, TaskFilters>['items'];
  kpis: Ref<TaskKpiResponse | null>;
  kpiLoading: Ref<boolean>;
  kpiError: Ref<string | null>;
  loadKPIs: () => Promise<void>;
  deleteTask: (task: DistributionTask) => Promise<void>;
  handleDelete: (task: DistributionTask) => Promise<void>;
  /** Residual #206: apply a KPI tile filter to the list. */
  applyKpiFilter: (key: TaskKpiFilterKey) => void;
  // Residual #272: listTasks INTERACTIVE_LIST_MAX_DAYS window honesty.
  listDateFrom: Ref<string | undefined>;
  listDateTo: Ref<string | undefined>;
  windowLabel: ComputedRef<string>;
} {
  const route = useRoute();
  const initialFilters: TaskFilters = {
    ...EMPTY_FILTERS,
    ...filtersFromRouteQuery(route.query as Record<string, unknown>)
  };

  // Residual #272: prefer API effective window over filter inputs (filters may be empty).
  const listDateFrom = ref<string | undefined>();
  const listDateTo = ref<string | undefined>();
  const windowLabel = computed(() => {
    if (listDateFrom.value && listDateTo.value) {
      return `${listDateFrom.value} ~ ${listDateTo.value}`;
    }
    return '近 90 天';
  });

  let disposed = false;
  let latestListRequestId = 0;
  const listRef: { current?: PagedListReturn<DistributionTask, TaskFilters> } = {};

  function listQueryKey(page: number, pageSize: number, filters: unknown): string {
    return JSON.stringify({ page, pageSize, filters }) ?? '';
  }

  const list = usePagedList<DistributionTask, TaskFilters>(
    async ({ page, pageSize, filters, requestId }) => {
      latestListRequestId = requestId;
      const requestKey = listQueryKey(page, pageSize, filters);
      // Residual #201: API expects overdue/hasAttribution as 0|1 numbers.
      const overdueParam = filters.overdue === undefined ? undefined : filters.overdue ? 1 : 0;
      const hasAttributionParam =
        filters.hasAttribution === undefined ? undefined : filters.hasAttribution ? 1 : 0;
      const data = await api.listTasks({
        status: filters.status || undefined,
        channel: filters.channel || undefined,
        priority: filters.priority || undefined,
        campaignId: filters.campaignId || undefined,
        groupId: filters.groupId || undefined,
        // Residual #247: exact packageId filter.
        packageId: filters.packageId || undefined,
        // Residual #197: honor assignee filter (API SQL already branches).
        assigneeId: filters.assigneeId || undefined,
        keyword: filters.keyword || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        overdue: overdueParam,
        hasAttribution: hasAttributionParam,
        page,
        pageSize
      });
      const currentList = listRef.current;
      const currentKey = listQueryKey(
        currentList?.pagination.value.current ?? page,
        currentList?.pagination.value.pageSize ?? pageSize,
        currentList?.filters ?? filters
      );
      // Residual #272: only the current list request may project the effective window.
      if (!disposed && requestId === latestListRequestId && requestKey === currentKey) {
        listDateFrom.value = data.dateFrom;
        listDateTo.value = data.dateTo;
      }
      return { items: data.items ?? [], total: data.total ?? 0 };
    },
    initialFilters,
    {
      onError: (msg) => ElMessage.error(extractErrorMessage(msg, '加载任务列表失败'))
    }
  );
  listRef.current = list;

  const kpis = ref<TaskKpiResponse | null>(null);
  const kpiLoading = ref(false);
  const kpiError = ref<string | null>(null);
  let kpiRequestId = 0;

  onScopeDispose(() => {
    disposed = true;
    kpiRequestId += 1;
    kpiLoading.value = false;
  }, true);

  async function loadKPIs() {
    if (disposed) return;
    const requestId = ++kpiRequestId;
    kpiLoading.value = true;
    kpiError.value = null;
    try {
      const nextKpis = await api.getTaskKPIs();
      if (disposed || requestId !== kpiRequestId) return;
      kpis.value = nextKpis;
    } catch (err) {
      if (disposed || requestId !== kpiRequestId) return;
      kpis.value = null;
      kpiError.value = extractErrorMessage(err, '加载任务指标失败');
      ElMessage.error(kpiError.value);
    } finally {
      if (!disposed && requestId === kpiRequestId) kpiLoading.value = false;
    }
  }

  async function deleteTask(task: DistributionTask) {
    await confirmAndDelete(
      {
        message: `确定删除任务「${task.title || task.taskId}」吗?删除后不可恢复。`,
        title: '确认删除'
      },
      () => (disposed ? Promise.resolve() : api.deleteTask(task.taskId)),
      {
        successMsg: '任务已删除',
        errorMsg: '删除任务失败',
        isActive: () => !disposed,
        onSuccess: async () => {
          await list.load();
          await loadKPIs();
        }
      }
    );
  }

  /**
   * Residual #206: KPI click sets status to match getTaskKpi CASE arms.
   * Clears the plannedAt-overdue flag so status and overdue=1 do not stack.
   */
  function applyKpiFilter(key: TaskKpiFilterKey) {
    const status = KPI_STATUS_MAP[key];
    if (!status) return;
    list.filters.status = status;
    list.filters.overdue = undefined;
    list.refresh();
  }

  onMounted(() => {
    list.load();
    loadKPIs();
  });

  return {
    ...list,
    tasks: list.items,
    kpis,
    kpiLoading,
    kpiError,
    loadKPIs,
    deleteTask,
    handleDelete: deleteTask,
    applyKpiFilter,
    // Residual #272
    listDateFrom,
    listDateTo,
    windowLabel
  };
}
