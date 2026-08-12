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
    verification: 'ready';
    refundRequest: 'ready';
    externalRefund: 'not_connected';
    inventoryRestock: 'ready';
  };
}

export async function getOrderCenterOrders(params: {
  search?: string;
  status?: string;
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

export async function verifyOrderCenterOrder(
  orderId: string,
  data: { amountFen?: string; quantity?: number; verificationCode?: string; storeId?: string; reason?: string },
  idempotencyKey: string
) {
  return (
    await client.post(`/order-center/orders/${encodeURIComponent(orderId)}/verify`, data, {
      headers: { 'Idempotency-Key': idempotencyKey },
      timeout: 30000
    })
  ).data;
}

export async function requestOrderRefund(
  orderId: string,
  data: { refundType: string; amountFen?: string; reason: string },
  idempotencyKey: string
) {
  return (
    await client.post(`/order-center/orders/${encodeURIComponent(orderId)}/refund-requests`, data, {
      headers: { 'Idempotency-Key': idempotencyKey },
      timeout: 30000
    })
  ).data as RefundRequest;
}

export async function approveOrderRefund(refundId: string, reason: string, idempotencyKey: string) {
  return (
    await client.post(
      `/order-center/refund-requests/${encodeURIComponent(refundId)}/approve`,
      { reason: reason || undefined },
      { headers: { 'Idempotency-Key': idempotencyKey }, timeout: 30000 }
    )
  ).data as RefundRequest;
}

export async function completeOrderRefund(
  refundId: string,
  data: { thirdPartyRefundId: string; restoreInventoryQuantity?: number },
  idempotencyKey: string
) {
  return (
    await client.post(
      `/order-center/refund-requests/${encodeURIComponent(refundId)}/complete`,
      data,
      { headers: { 'Idempotency-Key': idempotencyKey }, timeout: 30000 }
    )
  ).data as RefundRequest;
}
