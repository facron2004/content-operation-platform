import { computed, onScopeDispose, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getUserLifecycle,
  type UserLifecycleMember,
  type UserLifecycleResponse,
  type UserLifecycleStageKey
} from '../../services/api/user-lifecycle.api';
import { formatFenYuan } from '../../utils/format';

const PAGE_SIZE = 20;
const STAGES: UserLifecycleStageKey[] = ['prospect', 'new', 'active', 'at_risk', 'churned'];

export function useUserLifecycle() {
  const route = useRoute();
  const router = useRouter();
  const stage = ref<UserLifecycleStageKey | ''>(
    STAGES.includes(route.query.stage as UserLifecycleStageKey)
      ? (route.query.stage as UserLifecycleStageKey)
      : ''
  );
  const page = ref(Number(route.query.page) > 0 ? Number(route.query.page) : 1);
  const loading = ref(false);
  const error = ref<string | null>(null);
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

  const summary = computed(() => data.value.summary);
  const stages = computed(() => data.value.stages);
  const items = computed(() => data.value.items);
  const pagination = computed(() => data.value.pagination);

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
    } catch (cause) {
      if (!disposed && currentRequestId === requestId) {
        error.value = cause instanceof Error ? cause.message : '用户生命周期加载失败';
      }
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
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
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(value)
    );
  }
  function stageType(value: UserLifecycleMember['stage']) {
    return value === 'active' ? 'success' : value === 'new' ? 'primary' : value === 'at_risk' ? 'warning' : value === 'churned' ? 'danger' : 'info';
  }

  load();
  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
  });

  return {
    stage,
    loading,
    error,
    summary,
    stages,
    items,
    pagination,
    dataSources: computed(() => data.value.dataSources),
    asOf: computed(() => data.value.asOf),
    load,
    applyStage,
    setPage,
    displayFen,
    displayDate,
    stageType
  };
}
