import client from '../http-client';
import { downloadBlob } from '../http-client';
import { cachedGet } from '../cache.service';

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
  reload?: boolean;
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
}

const SUMMARY_TTL = 120_000;
const LIST_TTL = 60_000;

const getSummary = (params: WelfarePointQuery) =>
  cachedGet<WelfarePointSummary>(
    () => client.get('/welfare-points/summary', { params }).then((r) => r.data),
    '/welfare-points/summary',
    params,
    SUMMARY_TTL
  );

const getList = (params: WelfarePointQuery) =>
  cachedGet<WelfarePointListResult>(
    () => client.get('/welfare-points', { params }).then((r) => r.data),
    '/welfare-points',
    params,
    LIST_TTL
  );

export function getWelfarePointsSummary(params: WelfarePointQuery): Promise<WelfarePointSummary> {
  return getSummary(params);
}

export function getWelfarePointsList(params: WelfarePointQuery): Promise<WelfarePointListResult> {
  return getList(params);
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
