import { withForce } from './with-force';
import client from '../http-client';
import type { AxiosRequestConfig } from 'axios';
import type { RetryableConfig } from '../http-client-utils';
import { buildBusinessIntentKey } from '../idempotency-key';

export type GmvFenValue = string | number | null;

export interface GmvCompareDelta {
  totalGmv?: number | null;
  totalGmvFen?: number | null;
  paidOrderCount?: number | null;
  avgOrderValue?: number | null;
  refundRate?: number | null;
  verifyRate?: number | null;
  monthGmv?: number | null;
}

export interface GmvKpi {
  date: string;
  /** Legacy float fields remain optional during the API money-contract rollout. */
  totalGmv?: number | null;
  totalGmvFen?: GmvFenValue;
  totalGmvDisplay?: string | null;
  gmvOnline?: number | null;
  gmvOnlineFen?: GmvFenValue;
  gmvOnlineDisplay?: string | null;
  gmvWallet?: number | null;
  gmvWalletFen?: GmvFenValue;
  gmvWalletDisplay?: string | null;
  gmvBonus?: number | null;
  gmvBonusFen?: GmvFenValue;
  gmvBonusDisplay?: string | null;
  gmvCard?: number | null;
  gmvCardFen?: GmvFenValue;
  totalRefund?: number | null;
  totalRefundFen?: GmvFenValue;
  totalRefundDisplay?: string | null;
  refundRate: number;
  refundOrderCount: number;
  totalVerify?: number | null;
  totalVerifyFen?: GmvFenValue;
  totalVerifyDisplay?: string | null;
  verifyRate: number;
  paidOrderCount: number;
  paidAmountBonus?: number | null;
  paidAmountBonusFen?: GmvFenValue;
  paidAmountWallet?: number | null;
  paidAmountWalletFen?: GmvFenValue;
  avgOrderValue?: number | null;
  monthGmv?: number | null;
  monthGmvFen?: GmvFenValue;
  monthGmvDisplay?: string | null;
  monthGmvOnline?: number | null;
  monthGmvOnlineFen?: GmvFenValue;
  monthGmvWallet?: number | null;
  monthGmvWalletFen?: GmvFenValue;
  compare?: GmvCompareDelta;
  updatedAt: string | null;
  dataSource: 'DailyMetrics' | 'OrderHeader' | 'empty';
}

export interface GmvTrendPoint {
  date: string;
  totalGmv?: number | null;
  totalGmvFen?: GmvFenValue;
  totalGmvDisplay?: string | null;
  gmvOnline?: number | null;
  gmvOnlineFen?: GmvFenValue;
  gmvWallet?: number | null;
  gmvWalletFen?: GmvFenValue;
  gmvBonus?: number | null;
  gmvBonusFen?: GmvFenValue;
  totalRefund?: number | null;
  totalRefundFen?: GmvFenValue;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  refundCount?: number;
  verifyCount?: number;
}

export interface GmvHourlyPoint {
  hour: number;
  label: string;
  totalGmv?: number | null;
  totalGmvFen?: GmvFenValue;
  totalGmvDisplay?: string | null;
  paidOrderCount: number;
}

export interface GmvDistributionRow {
  key: string;
  totalGmv?: number | null;
  totalGmvFen?: GmvFenValue;
  totalGmvDisplay?: string | null;
  gmvOnline?: number | null;
  gmvOnlineFen?: GmvFenValue;
  gmvOnlineDisplay?: string | null;
  gmvWallet?: number | null;
  gmvWalletFen?: GmvFenValue;
  gmvWalletDisplay?: string | null;
  gmvBonus?: number | null;
  gmvBonusFen?: GmvFenValue;
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
  gmv?: number | null;
  gmvFen?: GmvFenValue;
  gmvDisplay?: string | null;
  gmvRefund?: number | null;
  gmvRefundFen?: GmvFenValue;
  gmvRefundDisplay?: string | null;
  gmvVerify?: number | null;
  gmvVerifyFen?: GmvFenValue;
  gmvVerifyDisplay?: string | null;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}

export type GmvTrendGranularity = 'day' | 'week' | 'month';

export interface GmvRefreshResult {
  startDate: string;
  endDate: string;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
  pagesFetched: number;
  pullWarnings?: string[];
  recomputeWarnings?: string[];
  kpi?: GmvKpi;
}

export type GmvRefreshJobStatus =
  'queued' | 'pulling' | 'recomputing' | 'finalizing' | 'done' | 'error' | 'interrupted';

export interface GmvRefreshProgress {
  pagesFetched: number;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
}

export interface GmvRefreshJob {
  jobId: string;
  status: GmvRefreshJobStatus;
  startDate: string;
  endDate: string;
  progress: GmvRefreshProgress;
  result?: GmvRefreshResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GmvRefreshStartResponse {
  jobId: string;
  startDate: string;
  endDate: string;
  status: GmvRefreshJobStatus;
}

/**
 * Kick off an async GMV refresh (JeeSite pull + money recompute). Returns
 * immediately with a jobId — the heavy work runs server-side and is polled via
 * getGmvRefreshStatus, so wide ranges (e.g. 30 days) never hit the HTTP timeout.
 */
export async function startGmvRefresh(startDate: string, endDate: string, sourceVersion: string) {
  const config: AxiosRequestConfig & { __silentError__: true } = {
    timeout: 30000,
    __silentError__: true,
    headers: {
      'Idempotency-Key': buildBusinessIntentKey('data-backfill', startDate, endDate, sourceVersion)
    }
  };
  return (
    await client.post<GmvRefreshStartResponse>(
      `/gmv/refresh?_=${Date.now()}`,
      { startDate, endDate },
      config
    )
  ).data;
}

/** Poll the progress/result of a refresh job started by startGmvRefresh. */
export async function getGmvRefreshStatus(jobId: string) {
  return (
    await client.get<GmvRefreshJob>(`/gmv/refresh/${encodeURIComponent(jobId)}`, {
      timeout: 10000,
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
  force = false,
  date?: string
) {
  const dateQuery = date ? `&date=${encodeURIComponent(date)}` : '';
  return (
    await client.get<GmvDistributionResponse>(
      withForce(`/gmv/distribution?dim=${dim}${dateQuery}`, force),
      { params: { limit }, timeout: 10000 }
    )
  ).data;
}

export async function getGmvByMerchant(
  sortBy: 'gmvDesc' | 'refundDesc' | 'verifyDesc' | 'orderDesc' = 'gmvDesc',
  page = 1,
  pageSize = 20,
  force = false,
  date?: string
) {
  const url = date ? `/gmv/by-merchant?date=${encodeURIComponent(date)}` : '/gmv/by-merchant';
  return (
    await client.get<{
      items: GmvMerchantRow[];
      hasMore: boolean;
      limit?: number;
      truncated?: boolean;
    }>(withForce(url, force), { params: { sortBy, page, pageSize }, timeout: 10000 })
  ).data;
}
