import client from '../http-client';
import { cachedGet, clearCache } from '../cache.service';
import { withForce } from './with-force';

export interface OverviewKpi {
  date: string;
  totalMerchants: number;
  totalSkus: number;
  zeroSalesMerchants: number;
  zeroSalesSkuCount: number;
  zeroSalesSkuRatio: number;
  todayGmv?: number;
  todayGmvFen?: string | number | null;
  todayOrderCount: number;
  updatedAt: string | null;
  dataSource: string;
}
export interface OverviewTrendPoint {
  date: string;
  gmvFen: string | number | null;
  paidOrderCount: number;
}
export interface OverviewDistributionRow {
  key: string;
  totalSku: number;
  stockLeft: number;
}

/** Residual #288: Top-N head + honesty for /overview/distribution. */
export interface OverviewDistributionResponse {
  items: OverviewDistributionRow[];
  limit: number;
  matched: number;
  truncated: boolean;
}

export interface OverviewTopOffender {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  stale30SkuCount: number;
  totalSku: number;
}

/** Residual #287: Top-N head + honesty for /overview/top-offenders. */
export interface OverviewTopOffendersResponse {
  items: OverviewTopOffender[];
  limit: number;
  matched: number;
  truncated: boolean;
}

const TTL = 60_000;
const get = <T>(path: string, params: Record<string, unknown>, force = false) => {
  const fetcher = () =>
    client.get(withForce(path, force), { params }).then((response) => response.data as T);
  if (force) {
    clearCache(path);
    return fetcher();
  }
  return cachedGet<T>(fetcher, path, params, TTL);
};
export const getOverviewKpis = (date?: string, force = false) =>
  get<OverviewKpi>('/overview/kpis', { date }, force);
export const getOverviewTrend = (days: 7 | 30, endDate?: string, force = false) =>
  get<OverviewTrendPoint[]>('/overview/trend', { days, endDate }, force);
export const getOverviewDistribution = (
  dim: 'area' | 'category' | 'stale',
  limit: number,
  date?: string,
  force = false
) => get<OverviewDistributionResponse>('/overview/distribution', { dim, limit, date }, force);
export const getOverviewTopOffenders = (limit = 10, date?: string, force = false) =>
  get<OverviewTopOffendersResponse>('/overview/top-offenders', { limit, date }, force);
