import client from '../http-client';

export type MoneyWireValue = string | number | null;

export interface UnmatchedOrder {
  orderId: string;
  memberId: string | null;
  packageId: string | null;
  orderAmountFen: MoneyWireValue;
  paidAmountFen: MoneyWireValue;
  orderAmountDisplay?: string;
  paidAmountDisplay?: string;
  orderTime: string;
  status: string;
}

export interface UnmatchedOrdersResponse {
  items: UnmatchedOrder[];
  total: number;
  page: number;
  pageSize: number;
  dateFrom: string;
  dateTo: string;
}

export interface UnmatchedOrdersQuery {
  page?: number;
  pageSize?: number;
}

export interface AttributionRecomputeResponse {
  success: true;
  processedTasks: number;
}

export interface AttributionMutationResponse {
  success: true;
  deleted?: number;
}

export function getUnmatchedOrders(params: UnmatchedOrdersQuery = {}) {
  return client
    .get<UnmatchedOrdersResponse>('/attribution/unmatched-orders', { params })
    .then((response) => response.data);
}

export function recomputeAttribution() {
  return client
    .post<AttributionRecomputeResponse>('/attribution/recompute')
    .then((response) => response.data);
}

export function manualBindAttribution(params: { taskId: string; orderId: string }) {
  return client
    .post<AttributionMutationResponse>('/attribution/manual-bind', params)
    .then((response) => response.data);
}

export function revokeAttribution(attributionId: string) {
  return client
    .post<AttributionMutationResponse>(`/attribution/${encodeURIComponent(attributionId)}/revoke`)
    .then((response) => response.data);
}
