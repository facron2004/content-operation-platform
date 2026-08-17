import { computed, onScopeDispose, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getOrderCenterOrder,
  getOrderCenterOrders,
  getOrderCenterTransactions,
  type OrderCenterDetailResponse,
  type OrderCenterItem,
  type OrderCenterListResponse,
  type OrderTransactionTimeline
} from '../../services/api/order-center.api';
import { formatFenYuan } from '../../utils/format';

const PAGE_SIZE = 20;

export function useOrderCenter() {
  const route = useRoute();
  const router = useRouter();
  const search = ref(typeof route.query.search === 'string' ? route.query.search : '');
  const status = ref(typeof route.query.status === 'string' ? route.query.status : '');
  const category = ref(typeof route.query.category === 'string' ? route.query.category : '');
  const page = ref(Number(route.query.page) > 0 ? Number(route.query.page) : 1);
  const loading = ref(false);
  const detailLoading = ref(false);
  const error = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  const items = ref<OrderCenterItem[]>([]);
  const selectedOrderId = ref(
    typeof route.params.orderId === 'string'
      ? route.params.orderId
      : typeof route.query.orderId === 'string'
        ? route.query.orderId
        : ''
  );
  const detail = ref<OrderCenterDetailResponse | null>(null);
  const transactions = ref<OrderTransactionTimeline | null>(null);
  const transactionLoading = ref(false);
  const summary = ref<OrderCenterListResponse['summary']>({
    totalOrders: 0,
    paidOrders: 0,
    verifiedOrders: 0,
    refundedOrders: 0,
    paidAmountFen: null,
    paidAmountWalletFen: null
  });
  const pagination = ref<OrderCenterListResponse['pagination']>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: false
  });
  let disposed = false;
  let listRequestId = 0;
  let detailRequestId = 0;

  const selectedOrder = computed(() => detail.value?.order ?? null);

  async function reload() {
    const requestId = ++listRequestId;
    loading.value = true;
    error.value = null;
    try {
      const response = await getOrderCenterOrders({
        search: search.value.trim() || undefined,
        status: status.value || undefined,
        category: category.value.trim() || undefined,
        page: page.value,
        pageSize: PAGE_SIZE
      });
      if (disposed || requestId !== listRequestId) return;
      items.value = response.items;
      summary.value = response.summary;
      pagination.value = response.pagination;
      const current = selectedOrderId.value;
      if (current) {
        await loadDetail(current);
      } else if (response.items[0]) {
        await selectOrder(response.items[0].orderId, false);
      } else {
        selectedOrderId.value = '';
        detail.value = null;
        transactions.value = null;
      }
    } catch (cause) {
      if (!disposed && requestId === listRequestId) {
        error.value = cause instanceof Error ? cause.message : '订单列表加载失败';
      }
    } finally {
      if (!disposed && requestId === listRequestId) loading.value = false;
    }
  }

  async function loadDetail(orderId: string) {
    const requestId = ++detailRequestId;
    detailLoading.value = true;
    detailError.value = null;
    try {
      const response = await getOrderCenterOrder(orderId);
      if (disposed || requestId !== detailRequestId) return;
      detail.value = response;
      await loadTransactions(orderId);
    } catch (cause) {
      if (!disposed && requestId === detailRequestId) {
        detailError.value = cause instanceof Error ? cause.message : '订单详情加载失败';
      }
    } finally {
      if (!disposed && requestId === detailRequestId) detailLoading.value = false;
    }
  }

  async function loadTransactions(orderId: string) {
    transactionLoading.value = true;
    try {
      const response = await getOrderCenterTransactions(orderId);
      if (!disposed && orderId === selectedOrderId.value) transactions.value = response;
    } catch {
      if (!disposed && orderId === selectedOrderId.value) transactions.value = null;
    } finally {
      if (!disposed) transactionLoading.value = false;
    }
  }

  async function selectOrder(orderId: string, updateRoute = true) {
    if (disposed || !orderId) return;
    selectedOrderId.value = orderId;
    if (updateRoute) {
      await router.replace({
        query: {
          search: search.value || undefined,
          status: status.value || undefined,
          category: category.value.trim() || undefined,
          page: page.value > 1 ? String(page.value) : undefined,
          orderId
        }
      });
    }
    await loadDetail(orderId);
  }

  async function applyFilters() {
    page.value = 1;
    selectedOrderId.value = '';
    detail.value = null;
    transactions.value = null;
    await router.replace({
      query: {
        search: search.value || undefined,
        status: status.value || undefined,
        category: category.value.trim() || undefined
      }
    });
    await reload();
  }

  async function setPage(nextPage: number) {
    if (nextPage < 1 || nextPage === page.value) return;
    page.value = nextPage;
    selectedOrderId.value = '';
    detail.value = null;
    transactions.value = null;
    await router.replace({
      query: {
        search: search.value || undefined,
        status: status.value || undefined,
        category: category.value.trim() || undefined,
        page: nextPage > 1 ? String(nextPage) : undefined
      }
    });
    await reload();
  }

  function displayFen(fen: string | null | undefined) {
    return formatFenYuan(fen);
  }

  function paidTotalFen(order: Pick<OrderCenterItem, 'paidAmountFen' | 'paidAmountWalletFen'>) {
    const amounts = [order.paidAmountFen, order.paidAmountWalletFen].filter(
      (value): value is string => value !== null && value !== undefined && value !== ''
    );
    return amounts.length
      ? amounts.reduce((total, value) => total + BigInt(value), 0n).toString()
      : null;
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

  function statusLabel(value: string) {
    const labels: Record<string, string> = {
      partially_verified: '部分核销',
      refunding: '退款处理中',
      partially_refunded: '部分退款',
      completed: '已完成',
      paid: '已支付',
      verified: '已核销',
      refunded: '已退款',
      pending: '待支付',
      cancelled: '已取消',
      closed: '已关闭'
    };
    return labels[value] ?? (value || '未标注');
  }

  function statusType(value: string): 'success' | 'warning' | 'danger' | 'info' {
    if (value === 'verified') return 'success';
    if (value === 'refunded' || value === 'cancelled' || value === 'closed') return 'danger';
    if (value === 'refunding' || value === 'partially_refunded') return 'warning';
    if (value === 'pending') return 'warning';
    return 'info';
  }

  reload();
  onScopeDispose(() => {
    disposed = true;
    listRequestId += 1;
    detailRequestId += 1;
  });

  return {
    search,
    status,
    category,
    page,
    loading,
    detailLoading,
    error,
    detailError,
    items,
    selectedOrderId,
    selectedOrder,
    detail,
    transactions,
    transactionLoading,
    summary,
    pagination,
    reload,
    applyFilters,
    setPage,
    selectOrder,
    displayFen,
    paidTotalFen,
    displayDate,
    displayDateTime,
    statusLabel,
    statusType
  };
}
