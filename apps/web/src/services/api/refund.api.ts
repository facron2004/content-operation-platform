import client from '../http-client';

export interface TopMerchantRow {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  gmv: number;
  refund: number;
  verify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}
export interface RefundTodayPayload {
  date: string;
  totalRefund: number;
  totalGmv: number;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
  topRefundMerchants: TopMerchantRow[];
  updatedAt: string;
}
export interface VerifyTodayPayload {
  date: string;
  totalVerify: number;
  totalGmv: number;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
  topVerifyMerchants: TopMerchantRow[];
  updatedAt: string;
}
export interface RefundTrendPoint {
  date: string;
  totalRefund: number;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
}
export interface VerifyTrendPoint {
  date: string;
  totalVerify: number;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
}

export const getRefundToday = (date?: string) =>
  client.get<RefundTodayPayload>('/refund/today', { params: { date } }).then((r) => r.data);
export const getRefundTrend = (days: 7 | 30, endDate?: string) =>
  client
    .get<RefundTrendPoint[]>('/refund/trend', { params: { days, endDate } })
    .then((r) => r.data);
export const getVerifyToday = (date?: string) =>
  client.get<VerifyTodayPayload>('/verify/today', { params: { date } }).then((r) => r.data);
export const getVerifyTrend = (days: 7 | 30, endDate?: string) =>
  client
    .get<VerifyTrendPoint[]>('/verify/trend', { params: { days, endDate } })
    .then((r) => r.data);
export const getRefundTopMerchants = (params: {
  sortBy: 'refundDesc' | 'verifyDesc';
  page: number;
  pageSize: number;
}) =>
  client
    .get<{
      items: TopMerchantRow[];
      hasMore: boolean;
      // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
      limit?: number;
      truncated?: boolean;
    }>('/refund/top-merchants', { params })
    .then((r) => r.data);
