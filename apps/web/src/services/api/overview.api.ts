import client from '../http-client';
import { cachedGet } from '../cache.service';

export interface OverviewKpi {
  date: string;
  totalMerchants: number;
  totalSkus: number;
  zeroSalesMerchants: number;
  zeroSalesSkuCount: number;
  zeroSalesSkuRatio: number;
  todayGmv: number;
  todayOrderCount: number;
  updatedAt: string;
  dataSource: string;
}
export interface OverviewTrendPoint {
  date: string;
  gmv: number;
  paidOrderCount: number;
}
export interface OverviewDistributionRow {
  key: string;
  totalSku: number;
  stockLeft: number;
}
export interface OverviewTopOffender {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  stale30SkuCount: number;
  totalSku: number;
}

const TTL = 60_000;
const get = <T>(path: string, params: Record<string, unknown>) =>
  cachedGet<T>(() => client.get(path, { params }).then((res) => res.data), path, params, TTL);
export const getOverviewKpis = (date?: string) => get<OverviewKpi>('/overview/kpis', { date });
export const getOverviewTrend = (days: 7 | 30, endDate?: string) =>
  get<OverviewTrendPoint[]>('/overview/trend', { days, endDate });
export const getOverviewDistribution = (dim: 'area' | 'category' | 'stale', limit: number) =>
  get<OverviewDistributionRow[]>('/overview/distribution', { dim, limit });
export const getOverviewTopOffenders = (limit = 10) =>
  get<OverviewTopOffender[]>('/overview/top-offenders', { limit });
