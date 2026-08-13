import client from '../http-client';
import { withForce } from './with-force';

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
  updatedAt: string | null;
}
export interface VerifyTodayPayload {
  date: string;
  totalVerify: number;
  totalGmv: number;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
  topVerifyMerchants: TopMerchantRow[];
  updatedAt: string | null;
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

export type RefundWindow = 'day' | 'week' | 'month' | 'year';
export type TrendBucket = 'day' | 'week' | 'month' | 'year';

export const getRefundToday = (date?: string, window?: RefundWindow, force = false) =>
  client
    .get<RefundTodayPayload>(withForce('/refund/today', force), { params: { date, window } })
    .then((r) => r.data);
export const getRefundTrend = (
  days: 7 | 30,
  endDate?: string,
  bucket?: TrendBucket,
  force = false
) =>
  client
    .get<RefundTrendPoint[]>(withForce('/refund/trend', force), {
      params: { days, endDate, bucket }
    })
    .then((r) => r.data);
export const getVerifyToday = (date?: string, window?: RefundWindow, force = false) =>
  client
    .get<VerifyTodayPayload>(withForce('/verify/today', force), { params: { date, window } })
    .then((r) => r.data);
export const getVerifyTrend = (
  days: 7 | 30,
  endDate?: string,
  bucket?: TrendBucket,
  force = false
) =>
  client
    .get<VerifyTrendPoint[]>(withForce('/verify/trend', force), {
      params: { days, endDate, bucket }
    })
    .then((r) => r.data);
export const getRefundTopMerchants = (
  params: {
    sortBy: 'refundDesc' | 'verifyDesc';
    page: number;
    pageSize: number;
    /** 周期口径: 今日/本周/本月/本年. */
    window?: RefundWindow;
    /** 周期锚点日期(可选). */
    date?: string;
  },
  force = false
) =>
  client
    .get<{
      items: TopMerchantRow[];
      hasMore: boolean;
      // Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty.
      limit?: number;
      truncated?: boolean;
    }>(withForce('/refund/top-merchants', force), { params })
    .then((r) => r.data);
