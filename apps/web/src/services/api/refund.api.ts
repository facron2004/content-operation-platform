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

async function getData<T>(path: string, params?: Record<string, unknown>) {
  const { default: client } = await import('../http-client');
  return (await client.get<T>(path, { params })).data;
}
export const getRefundToday = (date?: string) =>
  getData<RefundTodayPayload>('/refund/today', { date });
export const getRefundTrend = (days: 7 | 30, endDate?: string) =>
  getData<RefundTrendPoint[]>('/refund/trend', { days, endDate });
export const getVerifyToday = (date?: string) =>
  getData<VerifyTodayPayload>('/verify/today', { date });
export const getVerifyTrend = (days: 7 | 30, endDate?: string) =>
  getData<VerifyTrendPoint[]>('/verify/trend', { days, endDate });
export const getRefundTopMerchants = (params: {
  sortBy: 'refundDesc' | 'verifyDesc';
  page: number;
  pageSize: number;
}) => getData<{ items: TopMerchantRow[]; hasMore: boolean }>('/refund/top-merchants', params);
