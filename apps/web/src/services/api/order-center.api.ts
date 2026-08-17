import client from '../http-client';

export interface OrderCenterItem {
  orderId: string;
  orderCode: string | null;
  memberId: string | null;
  memberName: string | null;
  packageId: string | null;
  packageName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  orderTime: string;
  paidTime: string | null;
  verifyTime: string | null;
  refundTime: string | null;
  status: string;
  channel: string | null;
  orderAmountFen: string | null;
  paidAmountFen: string | null;
  paidAmountWalletFen: string | null;
  refundAmountFen: string | null;
  verifyAmountFen: string | null;
}

export interface OrderCenterListResponse {
  items: OrderCenterItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    totalOrders: number;
    paidOrders: number;
    verifiedOrders: number;
    refundedOrders: number;
    paidAmountFen: string | null;
    paidAmountWalletFen: string | null;
  };
  dataSources: string[];
}

export interface OrderCenterDetailResponse {
  order: OrderCenterItem;
  member: {
    memberId: string;
    nickname: string | null;
    level: string | null;
  } | null;
  package: {
    packageId: string;
    packageName: string;
    merchantName: string;
    category: string;
  } | null;
  dataSources: string[];
}

export interface OrderStateHistory {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  requestId: string | null;
  operatorId: string | null;
  createdAt: string;
}

export interface VerificationRecord {
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

export interface RefundRequest {
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
  stateHistory: OrderStateHistory[];
  verifications: VerificationRecord[];
  refunds: RefundRequest[];
  capabilities: {
    verification: 'read_only';
    refundRequest: 'read_only';
    externalRefund: 'not_connected';
    inventoryRestock: 'read_only';
  };
}

export async function getOrderCenterOrders(params: {
  search?: string;
  status?: string;
  category?: string;
  page: number;
  pageSize: number;
}) {
  return (
    await client.get<OrderCenterListResponse>('/order-center/orders', {
      params,
      timeout: 30000
    })
  ).data;
}

export async function getOrderCenterOrder(orderId: string) {
  return (
    await client.get<OrderCenterDetailResponse>(`/order-center/orders/${orderId}`, {
      timeout: 30000
    })
  ).data;
}

export async function getOrderCenterTransactions(orderId: string) {
  return (
    await client.get<OrderTransactionTimeline>(
      `/order-center/orders/${encodeURIComponent(orderId)}/transactions`,
      { timeout: 30000 }
    )
  ).data;
}
