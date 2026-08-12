import client from '../http-client';

export interface FinanceDashboardResponse {
  period: {
    dateFrom: string | null;
    dateTo: string | null;
  };
  metrics: {
    paidOrderCount: number;
    paidGrossFen: string;
    refundOrderCount: number;
    refundFen: string;
    verifiedOrderCount: number;
    verifiedFen: string;
    walletAssetFen: string;
    pointAsset: number;
    memberCount: number;
    pendingSettlementFen: string;
    settledFen: string;
    pendingProfitSharingFen: string;
    failedProfitSharingCount: number;
    openReconciliationDiffCount: number;
    assetAccountCount: number;
    benefitBalanceFen: string;
    pointBalance: string;
    pickupPointBalance: string;
  };
  channels: {
    onlineFen: string;
    walletFen: string;
    bonusFen: string;
    cardFen: string;
  };
  capabilities: {
    orderLedger: 'ready';
    assetLedger: 'ready' | 'not_connected';
    settlement: 'ready' | 'not_connected';
    profitSharing: 'ready' | 'not_connected';
    reconciliation: 'ready' | 'not_connected';
  };
  dataSources: string[];
}

export interface FinanceLedgerItem {
  eventId: string;
  eventType: 'payment' | 'refund';
  orderId: string;
  orderCode: string | null;
  merchantName: string | null;
  memberId: string | null;
  occurredAt: string;
  changeAmountFen: string;
  channel: string | null;
  status: string;
  remark: string;
}

export interface FinanceLedgerResponse {
  items: FinanceLedgerItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  dataSources: string[];
}

export async function getFinanceDashboard(params: { dateFrom?: string; dateTo?: string }) {
  return (
    await client.get<FinanceDashboardResponse>('/finance-center/dashboard', {
      params,
      timeout: 30000
    })
  ).data;
}

export async function getFinanceLedger(params: {
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  eventType?: 'all' | 'payment' | 'refund';
  page: number;
  pageSize: number;
}) {
  return (
    await client.get<FinanceLedgerResponse>('/finance-center/ledger', {
      params,
      timeout: 30000
    })
  ).data;
}
