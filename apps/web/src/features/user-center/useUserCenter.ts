import { computed, onScopeDispose, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getUserCenterMember,
  getUserCenterMembers,
  type UserCenterListResponse,
  type UserCenterMemberDetailResponse,
  type UserCenterMemberItem
} from '../../services/api/user-center.api';
import { formatFenYuan } from '../../utils/format';

const PAGE_SIZE = 20;

export function useUserCenter() {
  const route = useRoute();
  const router = useRouter();
  const search = ref(typeof route.query.search === 'string' ? route.query.search : '');
  const level = ref(typeof route.query.level === 'string' ? route.query.level : '');
  const page = ref(Number(route.query.page) > 0 ? Number(route.query.page) : 1);
  const loading = ref(false);
  const detailLoading = ref(false);
  const error = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  const items = ref<UserCenterMemberItem[]>([]);
  const selectedMemberId = ref(
    typeof route.params.userId === 'string'
      ? route.params.userId
      : typeof route.query.memberId === 'string'
        ? route.query.memberId
        : ''
  );
  const detail = ref<UserCenterMemberDetailResponse | null>(null);
  const dataSources = ref<string[]>([]);
  const summary = ref<UserCenterListResponse['summary']>({
    totalMembers: 0,
    paidMembers: 0,
    activeMembers30d: 0,
    totalOrders: 0,
    totalGmvFen: null
  });
  const pagination = ref<UserCenterListResponse['pagination']>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: false
  });
  let disposed = false;
  let listRequestId = 0;
  let detailRequestId = 0;

  const selectedMember = computed(() => detail.value?.member ?? null);

  async function reload() {
    const requestId = ++listRequestId;
    loading.value = true;
    error.value = null;
    try {
      const response = await getUserCenterMembers({
        search: search.value.trim() || undefined,
        level: level.value || undefined,
        page: page.value,
        pageSize: PAGE_SIZE
      });
      if (disposed || requestId !== listRequestId) return;
      items.value = response.items;
      summary.value = response.summary;
      pagination.value = response.pagination;
      dataSources.value = response.dataSources;
      const current = selectedMemberId.value;
      if (current) {
        await loadDetail(current, response.items.find((item) => item.memberId === current)?.inviteCode);
      } else if (response.items[0]) {
        await selectMember(response.items[0].memberId, false, response.items[0].inviteCode);
      } else {
        selectedMemberId.value = '';
        detail.value = null;
      }
    } catch (cause) {
      if (!disposed && requestId === listRequestId) {
        error.value = cause instanceof Error ? cause.message : '用户列表加载失败';
      }
    } finally {
      if (!disposed && requestId === listRequestId) loading.value = false;
    }
  }

  async function loadDetail(memberId: string, inviteCode?: string | null) {
    const requestId = ++detailRequestId;
    detailLoading.value = true;
    detailError.value = null;
    try {
      const response = await getUserCenterMember(memberId, inviteCode);
      if (disposed || requestId !== detailRequestId) return;
      detail.value = response;
    } catch (cause) {
      if (!disposed && requestId === detailRequestId) {
        detailError.value = cause instanceof Error ? cause.message : '用户详情加载失败';
      }
    } finally {
      if (!disposed && requestId === detailRequestId) detailLoading.value = false;
    }
  }

  async function selectMember(memberId: string, updateRoute = true, inviteCode?: string | null) {
    if (disposed || !memberId) return;
    selectedMemberId.value = memberId;
    if (updateRoute) {
      await router.replace({
        query: {
          search: search.value || undefined,
          level: level.value || undefined,
          page: page.value > 1 ? String(page.value) : undefined,
          memberId
        }
      });
    }
    await loadDetail(memberId, inviteCode);
  }

  async function applyFilters() {
    page.value = 1;
    selectedMemberId.value = '';
    detail.value = null;
    await router.replace({
      query: {
        search: search.value || undefined,
        level: level.value || undefined
      }
    });
    await reload();
  }

  async function setPage(nextPage: number) {
    if (nextPage < 1 || nextPage === page.value) return;
    page.value = nextPage;
    selectedMemberId.value = '';
    detail.value = null;
    await router.replace({
      query: {
        search: search.value || undefined,
        level: level.value || undefined,
        page: nextPage > 1 ? String(nextPage) : undefined
      }
    });
    await reload();
  }

  function displayFen(fen: string | null | undefined) {
    return formatFenYuan(fen);
  }

  function displayDate(value: string | null | undefined) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(value));
  }

  function displayDateTime(value: string | null | undefined) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function statusLabel(status: string) {
    const labels: Record<string, string> = {
      paid: '已支付',
      verified: '已核销',
      refunded: '已退款',
      pending: '待支付',
      cancelled: '已取消'
    };
    return labels[status] ?? status;
  }

  reload();
  onScopeDispose(() => {
    disposed = true;
    listRequestId += 1;
    detailRequestId += 1;
  });

  return {
    search,
    level,
    page,
    loading,
    detailLoading,
    error,
    detailError,
    items,
    selectedMemberId,
    selectedMember,
    detail,
    summary,
    pagination,
    dataSources: computed(() => dataSources.value),
    reload,
    applyFilters,
    setPage,
    selectMember,
    displayFen,
    displayDate,
    displayDateTime,
    statusLabel
  };
}
