import { withForce } from './with-force';
import client from '../http-client';
import type { RetryableConfig } from '../http-client-utils';

export interface GmvCompareDelta {
  totalGmv?: number | null;
  paidOrderCount?: number | null;
  avgOrderValue?: number | null;
  refundRate?: number | null;
  verifyRate?: number | null;
  monthGmv?: number | null;
}

export interface GmvKpi {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  gmvCard: number;
  totalRefund: number;
  refundRate: number;
  totalVerify: number;
  verifyRate: number;
  paidOrderCount: number;
  paidAmountBonus: number;
  paidAmountWallet: number;
  avgOrderValue: number;
  monthGmv: number;
  monthGmvOnline: number;
  monthGmvWallet: number;
  platformCommission: number;
  compare?: GmvCompareDelta;
  updatedAt: string;
  dataSource: 'DailyMetrics' | 'SalesSnapshot' | 'OrderHeader';
}

export interface GmvTrendPoint {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  totalRefund: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}

export interface GmvHourlyPoint {
  hour: number;
  label: string;
  totalGmv: number;
  paidOrderCount: number;
}

export interface GmvDistributionRow {
  key: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  share: number;
}

/** Residual #289: Top-N named-bucket head + honesty for /gmv/distribution. */
export interface GmvDistributionResponse {
  items: GmvDistributionRow[];
  limit: number;
  matched: number;
  truncated: boolean;
}

export interface GmvMerchantRow {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  gmv: number;
  gmvRefund: number;
  gmvVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}

export type GmvTrendGranularity = 'day' | 'week' | 'month';

export async function refreshGmvFromJeesite(startDate?: string, endDate?: string) {
  return (
    await client.post<{
      startDate: string;
      endDate: string;
      fetched: number;
      upserted: number;
      skipped: number;
      errors: number;
      pagesFetched: number;
      kpi: GmvKpi;
    }>(`/gmv/refresh?_=${Date.now()}`, { startDate, endDate }, {
      timeout: 15000,
      __silentError__: true
    } as RetryableConfig)
  ).data;
}

export async function getGmvToday(date?: string, force = false) {
  return (
    await client.get<GmvKpi>(withForce('/gmv/today', force), {
      params: date ? { date } : undefined,
      timeout: 10000
    })
  ).data;
}

export async function getGmvTrend(
  days: 7 | 30 | 90,
  endDate?: string,
  force = false,
  granularity: GmvTrendGranularity = 'day'
) {
  return (
    await client.get<GmvTrendPoint[]>(withForce('/gmv/trend', force), {
      params: { days, granularity, ...(endDate ? { endDate } : {}) },
      timeout: 10000
    })
  ).data;
}

export async function getGmvHourly(date?: string, force = false) {
  return (
    await client.get<GmvHourlyPoint[]>(withForce('/gmv/hourly', force), {
      params: date ? { date } : undefined,
      timeout: 10000
    })
  ).data;
}

export async function getGmvDistribution(
  dim: 'area' | 'category' | 'channel',
  limit = 20,
  force = false
) {
  return (
    await client.get<GmvDistributionResponse>(withForce('/gmv/distribution', force), {
      params: { dim, limit },
      timeout: 10000
    })
  ).data;
}

export async function getGmvByMerchant(
  sortBy: 'gmvDesc' | 'refundDesc' | 'verifyDesc' = 'gmvDesc',
  page = 1,
  pageSize = 20,
  force = false
) {
  return (
    await client.get<{
      items: GmvMerchantRow[];
      hasMore: boolean;
      limit?: number;
      truncated?: boolean;
    }>(withForce('/gmv/by-merchant', force), { params: { sortBy, page, pageSize }, timeout: 10000 })
  ).data;
}
