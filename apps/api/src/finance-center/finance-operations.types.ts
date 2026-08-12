export interface FinanceAccountView {
  id: string;
  ownerType: string;
  ownerId: string;
  assetType: string;
  balance: string;
  frozenBalance: string;
  status: string;
  updatedAt: string;
}

export interface AssetLedgerView {
  id: string;
  ledgerNo: string;
  accountId: string;
  ownerType: string;
  ownerId: string;
  assetType: string;
  businessType: string;
  businessId: string;
  changeType: string;
  beforeBalance: string;
  changeAmount: string;
  afterBalance: string;
  requestId: string;
  operatorId: string | null;
  remark: string | null;
  createdAt: string;
}

export interface FinanceSettlementView {
  id: string;
  settlementNo: string;
  merchantId: string;
  periodStart: string;
  periodEnd: string;
  totalAmountFen: string;
  serviceFeeFen: string;
  settlementAmountFen: string;
  status: string;
  approvedBy: string | null;
  paidAt: string | null;
  thirdPartyPaymentId: string | null;
  itemCount: number;
  remark: string | null;
  createdAt: string;
}

export interface ProfitSharingView {
  id: string;
  sharingNo: string;
  orderId: string;
  sharingType: string;
  totalAmountFen: string;
  platformAmountFen: string;
  merchantAmountFen: string;
  charityAmountFen: string;
  status: string;
  thirdPartyTransactionId: string | null;
  retryCount: number;
  requestId: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationDiffView {
  id: string;
  batchId: string;
  businessType: string;
  businessId: string;
  platformAmountFen: string;
  channelAmountFen: string;
  diffAmountFen: string;
  diffType: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  remark: string | null;
  createdAt: string;
}

export interface ReconciliationBatchView {
  id: string;
  batchNo: string;
  channel: string;
  businessDate: string;
  totalRecords: number;
  matchedRecords: number;
  diffRecords: number;
  status: string;
  createdAt: string;
}

export interface FinancePage<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}

export interface FinanceOperationsSummary {
  pendingSettlementFen: string;
  settledFen: string;
  pendingProfitSharingFen: string;
  failedProfitSharingCount: number;
  openReconciliationDiffCount: number;
  assetAccountCount: number;
  benefitBalanceFen: string;
  pointBalance: string;
  pickupPointBalance: string;
}
