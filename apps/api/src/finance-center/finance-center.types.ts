export type FinanceEventType = 'payment' | 'refund';

export type FinanceDashboardPayload = {
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
  };
  channels: {
    onlineFen: string;
    walletFen: string;
    bonusFen: string;
    cardFen: string;
  };
  capabilities: {
    orderLedger: 'ready';
    assetLedger: 'not_connected';
    settlement: 'not_connected';
    profitSharing: 'not_connected';
    reconciliation: 'not_connected';
  };
  dataSources: string[];
};

export type FinanceLedgerItem = {
  eventId: string;
  eventType: FinanceEventType;
  orderId: string;
  orderCode: string | null;
  merchantName: string | null;
  memberId: string | null;
  occurredAt: string;
  changeAmountFen: string;
  channel: string | null;
  status: string;
  remark: string;
};

export type FinanceLedgerPayload = {
  items: FinanceLedgerItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  dataSources: string[];
};
