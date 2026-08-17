import client from '../http-client';
import { downloadBlob } from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

export type WelfarePointType = 1 | 2;

export interface WelfarePointRecord {
  id: string;
  centerMemberId: string;
  memberName: string;
  memberPhone: string;
  memberCode: string;
  pointAmount: number;
  pointType: WelfarePointType;
  pointTypeLabel: string;
  sourceType: number;
  sourceTypeLabel: string;
  orderNo: string | null;
  currentBalance: number;
  expireTime: string | null;
  changeDesc: string;
  status: string;
  createDate: string;
  createDateTs: number;
  updateDate: string;
}

// Object literal type (not interface) so it keeps an implicit index signature
// and stays assignable to cachedGet's `Record<string, unknown>` params.
export type WelfarePointQuery = {
  page?: number;
  pageSize?: number;
  phone?: string;
  pointType?: '1' | '2';
  sourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
};

export interface WelfarePointKpis {
  totalRecords: number;
  totalRecharge: number;
  totalConsume: number;
  netChange: number;
  memberCount: number;
  currentBalanceSum: number;
}

export interface LabeledAmount {
  key: string | number;
  label: string;
  amount: number;
  count: number;
}

export interface WelfarePointDailyTrendPoint {
  date: string;
  recharge: number;
  consume: number;
  net: number;
  count: number;
}

export interface WelfarePointTopMember {
  centerMemberId: string;
  memberName: string;
  memberPhone: string;
  memberCode: string;
  recharge: number;
  consume: number;
  net: number;
  lastBalance: number;
  recordCount: number;
}

export interface WelfarePointSummary {
  kpis: WelfarePointKpis;
  byType: LabeledAmount[];
  bySource: LabeledAmount[];
  dailyTrend: WelfarePointDailyTrendPoint[];
  topMembers: WelfarePointTopMember[];
  dataRange: { minDate: string | null; maxDate: string | null };
  cached: boolean;
}

export interface WelfarePointListResult {
  list: WelfarePointRecord[];
  total: number;
  page: number;
  pageSize: number;
  dataSource: 'JeeSite' | 'WelfarePointRecord';
}

export interface WelfarePointRefreshResult {
  total: number;
  refreshedAt: string;
}

const SUMMARY_TTL = 120_000;
const LIST_TTL = 60_000;

const get = <T>(
  path: '/welfare-points' | '/welfare-points/summary',
  params: WelfarePointQuery,
  ttl: number,
  bypassCache = false
) => {
  const fetcher = () => client.get(path, { params }).then((r) => r.data as T);
  if (bypassCache) {
    clearCache(path);
    return fetcher();
  }
  return cachedGet<T>(fetcher, path, params, ttl);
};

export function getWelfarePointsSummary(
  params: WelfarePointQuery,
  bypassCache = false
): Promise<WelfarePointSummary> {
  return get<WelfarePointSummary>('/welfare-points/summary', params, SUMMARY_TTL, bypassCache);
}

export function getWelfarePointsList(
  params: WelfarePointQuery,
  bypassCache = false
): Promise<WelfarePointListResult> {
  return get<WelfarePointListResult>('/welfare-points', params, LIST_TTL, bypassCache);
}

export async function refreshWelfarePoints(): Promise<WelfarePointRefreshResult> {
  const response = await client.post('/welfare-points/refresh');
  // One pattern clears summary plus every cached list page/filter combination.
  clearCache('/welfare-points');
  return response.data as WelfarePointRefreshResult;
}

export function exportWelfarePointsCsv(params: WelfarePointQuery): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const url = `/welfare-points/export${qs.toString() ? `?${qs.toString()}` : ''}`;
  const filename = `welfare-points-${new Date().toISOString().slice(0, 10)}.csv`;
  return downloadBlob(url, filename);
}
