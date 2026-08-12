export interface OrderStateHistoryView {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  requestId: string | null;
  operatorId: string | null;
  createdAt: string;
}

export interface VerificationRecordView {
  id: string;
  verificationNo: string;
  orderId: string;
  packageId: string | null;
  merchantId: string | null;
  storeId: string | null;
  quantity: number;
  amountFen: string;
  verificationCode: string | null;
  operatorId: string | null;
  status: string;
  verifiedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
}

export interface RefundRequestView {
  id: string;
  refundNo: string;
  orderId: string;
  refundType: string;
  refundAmountFen: string;
  status: string;
  reason: string;
  requestedBy: string | null;
  approvedBy: string | null;
  thirdPartyRefundId: string | null;
  requestedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface OrderTransactionTimeline {
  stateHistory: OrderStateHistoryView[];
  verifications: VerificationRecordView[];
  refunds: RefundRequestView[];
  capabilities: {
    verification: 'ready';
    refundRequest: 'ready';
    externalRefund: 'not_connected';
    inventoryRestock: 'ready';
  };
}

export interface TransactionActor {
  userId?: string;
  username?: string;
}
