import { computed, onScopeDispose, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getActiveUserLifecycleRefresh,
  getUserLifecycleRefreshStatus,
  getUserLifecycle,
  startUserLifecycleRefresh,
  type UserLifecycleMember,
  type UserLifecycleResponse,
  type UserLifecycleStageKey
} from '../../services/api/user-lifecycle.api';
import type { UserCenterRefreshJob } from '../../services/api/user-center.api';
import { useRoleStore } from '../../stores/role';
import { formatFenYuan } from '../../utils/format';

const PAGE_SIZE = 20;
const STAGES: UserLifecycleStageKey[] = ['prospect', 'new', 'active', 'at_risk', 'churned'];
const REFRESH_POLL_INTERVAL_MS = 1500;
const REFRESH_MAX_DURATION_MS = 30 * 60 * 1000;

export function useUserLifecycle() {
  const route = useRoute();
  const router = useRouter();
  const roleStore = useRoleStore();
  const stage = ref<UserLifecycleStageKey | ''>(
    STAGES.includes(route.query.stage as UserLifecycleStageKey)
      ? (route.query.stage as UserLifecycleStageKey)
      : ''
  );
  const page = ref(Number(route.query.page) > 0 ? Number(route.query.page) : 1);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const refreshError = ref<string | null>(null);
  const refreshStarting = ref(false);
  const refreshJob = ref<UserCenterRefreshJob | null>(null);
  const data = ref<UserLifecycleResponse>({
    asOf: '',
    summary: {
      totalMembers: 0,
      paidMembers: 0,
      activeMembers30d: 0,
      atRiskMembers: 0,
      churnedMembers: 0,
      totalPaidGmvFen: null
    },
    stages: [],
    items: [],
    pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, hasMore: false },
    dataSources: []
  });
  let disposed = false;
  let requestId = 0;
  let refreshRequestId = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshStartedAt = 0;
  let initialSyncChecked = false;
  let activeRefreshChecked = false;

  const summary = computed(() => data.value.summary);
  const stages = computed(() => data.value.stages);
  const items = computed(() => data.value.items);
  const pagination = computed(() => data.value.pagination);
  const canRefresh = computed(() => roleStore.permissions.includes('analytics:refresh'));
  const refreshing = computed(
    () =>
      refreshStarting.value ||
      refreshJob.value?.status === 'queued' ||
      refreshJob.value?.status === 'pulling'
  );
  const refreshStatusText = computed(() => {
    const job = refreshJob.value;
    if (!job) return '';
    if (job.status === 'queued') return '用户目录同步任务排队中…';
    if (job.status === 'pulling') {
      const { pagesFetched, totalPages, membersPersisted } = job.progress;
      return `后台同步中：第 ${pagesFetched}/${totalPages || '—'} 页，已保存 ${membersPersisted.toLocaleString('zh-CN')} 条`;
    }
    if (job.status === 'done') return '用户目录同步完成，生命周期数据已更新';
    if (job.status === 'interrupted') return '同步任务被服务重启中断，仍保留上一次成功数据';
    return '用户目录同步失败，仍保留上一次成功数据';
  });

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  async function attachActiveRefresh() {
    if (disposed || activeRefreshChecked) return;
    activeRefreshChecked = true;
    try {
      const active = await getActiveUserLifecycleRefresh();
      if (disposed || !active || (active.status !== 'queued' && active.status !== 'pulling')) return;
      const currentRequestId = ++refreshRequestId;
      refreshStartedAt = Date.now();
      refreshJob.value = active;
      await pollRefreshJob(active.jobId, currentRequestId);
    } catch (cause) {
      if (!disposed) {
        refreshError.value = cause instanceof Error ? cause.message : '用户目录同步状态读取失败';
      }
    }
  }

  async function load() {
    const currentRequestId = ++requestId;
    loading.value = true;
    error.value = null;
    try {
      const response = await getUserLifecycle({
        stage: stage.value || undefined,
        page: page.value,
        pageSize: PAGE_SIZE
      });
      if (disposed || currentRequestId !== requestId) return;
      data.value = response;
      if (!initialSyncChecked) {
        initialSyncChecked = true;
        await attachActiveRefresh();
        if (
          !refreshJob.value ||
          (refreshJob.value.status !== 'queued' && refreshJob.value.status !== 'pulling')
        ) {
          if (canRefresh.value && !response.dataSources.includes('JeeSite Member')) {
            void refreshMembers();
          }
        }
      }
    } catch (cause) {
      if (!disposed && currentRequestId === requestId) {
        error.value = cause instanceof Error ? cause.message : '用户生命周期加载失败';
      }
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
    }
  }

  async function pollRefreshJob(jobId: string, currentRequestId: number): Promise<void> {
    if (disposed || currentRequestId !== refreshRequestId) return;
    try {
      const next = await getUserLifecycleRefreshStatus(jobId);
      if (disposed || currentRequestId !== refreshRequestId) return;
      refreshJob.value = next;
      if (next.status === 'done') {
        refreshError.value = next.result?.warnings.length ? next.result.warnings.join('；') : null;
        await load();
        return;
      }
      if (next.status === 'error' || next.status === 'interrupted') {
        refreshError.value = next.error ?? refreshStatusText.value;
        return;
      }
    } catch (cause) {
      if (disposed || currentRequestId !== refreshRequestId) return;
      if (Date.now() - refreshStartedAt > REFRESH_MAX_DURATION_MS) {
        refreshError.value = cause instanceof Error ? cause.message : '用户目录同步状态查询超时';
        return;
      }
      refreshTimer = setTimeout(() => {
        void pollRefreshJob(jobId, currentRequestId);
      }, 2000);
      return;
    }
    refreshTimer = setTimeout(() => {
      void pollRefreshJob(jobId, currentRequestId);
    }, REFRESH_POLL_INTERVAL_MS);
  }

  async function refreshMembers() {
    if (disposed || !canRefresh.value || refreshing.value) return;
    activeRefreshChecked = true;
    const currentRequestId = ++refreshRequestId;
    clearRefreshTimer();
    refreshStarting.value = true;
    refreshError.value = null;
    refreshStartedAt = Date.now();
    try {
      const job = await startUserLifecycleRefresh();
      if (disposed || currentRequestId !== refreshRequestId) return;
      refreshJob.value = job;
      await pollRefreshJob(job.jobId, currentRequestId);
    } catch (cause) {
      if (!disposed && currentRequestId === refreshRequestId) {
        refreshError.value = cause instanceof Error ? cause.message : '用户目录同步启动失败';
      }
    } finally {
      if (!disposed && currentRequestId === refreshRequestId) refreshStarting.value = false;
    }
  }

  async function applyStage(nextStage: UserLifecycleStageKey | '') {
    stage.value = nextStage;
    page.value = 1;
    await router.replace({ query: nextStage ? { stage: nextStage } : undefined });
    await load();
  }

  async function setPage(nextPage: number) {
    if (nextPage < 1 || nextPage === page.value) return;
    page.value = nextPage;
    await router.replace({
      query: {
        stage: stage.value || undefined,
        page: nextPage > 1 ? String(nextPage) : undefined
      }
    });
    await load();
  }

  function displayFen(value: string | null | undefined) {
    return formatFenYuan(value);
  }
  function displayDate(value: string | null | undefined) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(value));
  }
  function stageType(value: UserLifecycleMember['stage']) {
    return value === 'active'
      ? 'success'
      : value === 'new'
        ? 'primary'
        : value === 'at_risk'
          ? 'warning'
          : value === 'churned'
            ? 'danger'
            : 'info';
  }

  load();
  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
    refreshRequestId += 1;
    clearRefreshTimer();
  });

  return {
    stage,
    loading,
    error,
    refreshError,
    canRefresh,
    refreshing,
    refreshJob,
    refreshStatusText,
    summary,
    stages,
    items,
    pagination,
    dataSources: computed(() => data.value.dataSources),
    asOf: computed(() => data.value.asOf),
    load,
    refreshMembers,
    applyStage,
    setPage,
    displayFen,
    displayDate,
    stageType
  };
}
