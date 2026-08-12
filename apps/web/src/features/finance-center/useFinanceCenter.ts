import { onScopeDispose, ref } from 'vue';
import {
  getFinanceDashboard,
  getFinanceLedger,
  type FinanceDashboardResponse,
  type FinanceLedgerItem
} from '../../services/api/finance-center.api';
import { formatFenYuan } from '../../utils/format';

const PAGE_SIZE = 20;

const EMPTY_DASHBOARD: FinanceDashboardResponse = {
  period: { dateFrom: null, dateTo: null },
  metrics: {
    paidOrderCount: 0,
    paidGrossFen: '0',
    refundOrderCount: 0,
    refundFen: '0',
    verifiedOrderCount: 0,
    verifiedFen: '0',
    walletAssetFen: '0',
    pointAsset: 0,
    memberCount: 0,
    pendingSettlementFen: '0',
    settledFen: '0',
    pendingProfitSharingFen: '0',
    failedProfitSharingCount: 0,
    openReconciliationDiffCount: 0,
    assetAccountCount: 0,
    benefitBalanceFen: '0',
    pointBalance: '0',
    pickupPointBalance: '0'
  },
  channels: { onlineFen: '0', walletFen: '0', bonusFen: '0', cardFen: '0' },
  capabilities: {
    orderLedger: 'ready',
    assetLedger: 'not_connected',
    settlement: 'not_connected',
    profitSharing: 'not_connected',
    reconciliation: 'not_connected'
  },
  dataSources: []
};

export function useFinanceCenter() {
  const dateFrom = ref('');
  const dateTo = ref('');
  const keyword = ref('');
  const eventType = ref<'all' | 'payment' | 'refund'>('all');
  const page = ref(1);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const dashboard = ref<FinanceDashboardResponse>(EMPTY_DASHBOARD);
  const ledgerItems = ref<FinanceLedgerItem[]>([]);
  const pagination = ref({ page: 1, pageSize: PAGE_SIZE, total: 0, hasMore: false });
  let disposed = false;
  let requestId = 0;

  async function reload() {
    const currentRequestId = ++requestId;
    loading.value = true;
    error.value = null;
    try {
      const params = {
        dateFrom: dateFrom.value || undefined,
        dateTo: dateTo.value || undefined
      };
      const [dashboardResponse, ledgerResponse] = await Promise.all([
        getFinanceDashboard(params),
        getFinanceLedger({
          ...params,
          keyword: keyword.value.trim() || undefined,
          eventType: eventType.value,
          page: page.value,
          pageSize: PAGE_SIZE
        })
      ]);
      if (disposed || currentRequestId !== requestId) return;
      dashboard.value = dashboardResponse;
      ledgerItems.value = ledgerResponse.items;
      pagination.value = ledgerResponse.pagination;
    } catch (cause) {
      if (!disposed && currentRequestId === requestId) {
        error.value = cause instanceof Error ? cause.message : '资金数据加载失败';
      }
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
    }
  }

  async function applyFilters() {
    page.value = 1;
    await reload();
  }

  async function setPage(nextPage: number) {
    if (nextPage < 1 || nextPage === page.value) return;
    page.value = nextPage;
    await reload();
  }

  function displayFen(fen: string | null | undefined) {
    return formatFenYuan(fen);
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

  function formatCount(value: number | null | undefined) {
    return value == null ? '—' : value.toLocaleString('zh-CN');
  }

  function eventLabel(event: FinanceLedgerItem['eventType']) {
    return event === 'refund' ? '退款' : '支付';
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
    requestId += 1;
  });

  return {
    dateFrom,
    dateTo,
    keyword,
    eventType,
    page,
    loading,
    error,
    dashboard,
    ledgerItems,
    pagination,
    reload,
    applyFilters,
    setPage,
    displayFen,
    displayDateTime,
    formatCount,
    eventLabel,
    statusLabel
  };
}
