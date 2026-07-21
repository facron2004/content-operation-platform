import { withForce } from './with-force';

export type MerchantSalesWindow = 'day' | 'week' | 'month' | 'year';
export type MerchantSalesSort = 'gmvDesc' | 'refundDesc' | 'verifyDesc' | 'orderCountDesc';

export interface MerchantSalesSummary {
  window: MerchantSalesWindow;
  date: string;
  endDate: string;
  totalGmv: number;
  totalRefund: number;
  totalVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  merchantCount: number;
  packageCount: number;
  dataSource: 'MerchantDailyMetrics' | 'empty';
}

export interface MerchantSalesRankingRow {
  merchantName: string;
  areaName: string | null;
  gmv: number;
  gmvRefund: number;
  gmvVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  orderCount: number;
  packageCount: number;
}

export interface MerchantSalesRanking {
  items: MerchantSalesRankingRow[];
  pagination: { page: number; pageSize: number; hasMore: boolean; total: number };
}

export interface MerchantSalesTrendPoint {
  bucket: string;
  totalGmv: number;
  totalRefund: number;
  totalVerify: number;
  paidOrderCount: number;
}

export interface MerchantSalesRefreshResult {
  startDate: string;
  endDate: string;
  rowsUpserted: number;
}

export interface GetMerchantSalesSummaryParams {
  window: MerchantSalesWindow;
  date?: string;
  endDate?: string;
  force?: boolean;
}

export interface GetMerchantSalesRankingParams {
  window: MerchantSalesWindow;
  date?: string;
  endDate?: string;
  sortBy?: MerchantSalesSort;
  page?: number;
  pageSize?: number;
  force?: boolean;
}

export interface GetMerchantSalesTrendParams {
  window: Exclude<MerchantSalesWindow, 'day'>;
  date?: string;
  endDate?: string;
  force?: boolean;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export async function getMerchantSalesSummary(params: GetMerchantSalesSummaryParams) {
  const { default: client } = await import('../http-client');
  return (
    await client.get<MerchantSalesSummary>(withForce('/merchant-sales/summary', params.force), {
      params: {
        window: params.window,
        ...(params.date ? { date: params.date } : {}),
        ...(params.endDate ? { endDate: params.endDate } : {})
      }
    })
  ).data;
}

export async function getMerchantSalesRanking(params: GetMerchantSalesRankingParams) {
  const { default: client } = await import('../http-client');
  return (
    await client.get<MerchantSalesRanking>(withForce('/merchant-sales/ranking', params.force), {
      params: {
        window: params.window,
        sortBy: params.sortBy ?? 'gmvDesc',
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        ...(params.date ? { date: params.date } : {}),
        ...(params.endDate ? { endDate: params.endDate } : {})
      }
    })
  ).data;
}

export async function getMerchantSalesTrend(params: GetMerchantSalesTrendParams) {
  const { default: client } = await import('../http-client');
  return (
    await client.get<{ items: MerchantSalesTrendPoint[]; window: MerchantSalesWindow }>(
      withForce('/merchant-sales/trend', params.force),
      {
        params: {
          window: params.window,
          ...(params.date ? { date: params.date } : {}),
          ...(params.endDate ? { endDate: params.endDate } : {})
        }
      }
    )
  ).data;
}

export function getMerchantSalesExportUrl(params: {
  window: MerchantSalesWindow;
  date?: string;
  endDate?: string;
  sortBy?: MerchantSalesSort;
}) {
  const q = new URLSearchParams();
  q.set('window', params.window);
  if (params.date) q.set('date', params.date);
  if (params.endDate) q.set('endDate', params.endDate);
  if (params.sortBy) q.set('sortBy', params.sortBy);
  q.set('_', String(Date.now()));
  return `${API_BASE}/merchant-sales/export?${q.toString()}`;
}

export async function postMerchantSalesRefresh(body?: { startDate?: string; endDate?: string }) {
  const { default: client } = await import('../http-client');
  return (
    await client.post<MerchantSalesRefreshResult>(
      `/merchant-sales/refresh?_=${Date.now()}`,
      body ?? {}
    )
  ).data;
}
