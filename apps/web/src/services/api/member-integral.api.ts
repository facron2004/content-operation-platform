import client, { downloadBlob } from '../http-client';
import { cachedGet, clearCache } from '../cache.service';

export interface MemberIntegralRecord {
  id: string;
  centerMemberId: string;
  memberName: string;
  memberPhone: string;
  memberCode: string;
  inviteCode: string | null;
  parentInviteCode: string | null;
  consumptionIntegral: number;
  integralType: number;
  integralTypeLabel: string;
  state: number;
  stateLabel: string;
  orderCode: string | null;
  historyPrice: number | null;
  remarks: string;
  status: string;
  createDate: string;
  updateDate: string | null;
}

export interface MemberIntegralRecordPage {
  list: MemberIntegralRecord[];
  total: number;
  page: number;
  pageSize: number;
  dataSource: 'JeeSite' | 'MemberIntegralRecord';
}

// Object literal type (not interface) so it keeps an implicit index signature
// and stays assignable to cachedGet's `Record<string, unknown>` params.
export type MemberIntegralQuery = {
  page?: number;
  pageSize?: number;
  phone?: string;
  integralType?: string;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
};

export interface MemberIntegralKpis {
  totalRecords: number;
  totalGain: number;
  totalConsume: number;
  netChange: number;
  memberCount: number;
  totalHistoryPrice: number;
}

export interface LabeledAmount {
  key: string | number;
  label: string;
  amount: number;
  count: number;
}

export interface MemberIntegralDailyTrendPoint {
  date: string;
  gain: number;
  consume: number;
  net: number;
  count: number;
}

export interface MemberIntegralTopMember {
  centerMemberId: string;
  memberName: string;
  memberPhone: string;
  memberCode: string;
  gain: number;
  consume: number;
  net: number;
  recordCount: number;
}

export interface MemberIntegralSummary {
  kpis: MemberIntegralKpis;
  byType: LabeledAmount[];
  byState: LabeledAmount[];
  dailyTrend: MemberIntegralDailyTrendPoint[];
  topMembers: MemberIntegralTopMember[];
  dataRange: { minDate: string | null; maxDate: string | null };
  cached: boolean;
}

export interface MemberIntegralRefreshResult {
  total: number;
  refreshedAt: string;
}

const SUMMARY_TTL = 120_000;
const LIST_TTL = 60_000;

const get = <T>(
  path: '/member-integral-records' | '/member-integral-records/summary',
  params: MemberIntegralQuery,
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

export function getMemberIntegralSummary(
  params: MemberIntegralQuery,
  bypassCache = false
): Promise<MemberIntegralSummary> {
  return get<MemberIntegralSummary>(
    '/member-integral-records/summary',
    params,
    SUMMARY_TTL,
    bypassCache
  );
}

export function getMemberIntegralRecords(
  params: MemberIntegralQuery,
  bypassCache = false
): Promise<MemberIntegralRecordPage> {
  return get<MemberIntegralRecordPage>(
    '/member-integral-records',
    params,
    LIST_TTL,
    bypassCache
  );
}

export async function refreshMemberIntegral(): Promise<MemberIntegralRefreshResult> {
  // Same rationale as refreshWelfarePoints: a full upstream pull is throttled
  // by the shared JeeSite member client and can take minutes on large datasets.
  const response = await client.post('/member-integral-records/refresh', undefined, {
    timeout: 300000
  });
  // One pattern clears summary plus every cached list page/filter combination.
  clearCache('/member-integral-records');
  return response.data as MemberIntegralRefreshResult;
}

/** Local table row count — polled by the sync button to show progress without
 *  hitting the external service. */
export async function getMemberIntegralCount(): Promise<number> {
  const response = await client.get<{ count: number }>('/member-integral-records/count');
  return response.data.count;
}

export function exportMemberIntegralCsv(params: MemberIntegralQuery): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const url = `/member-integral-records/export${qs.toString() ? `?${qs.toString()}` : ''}`;
  const filename = `member-integral-${new Date().toISOString().slice(0, 10)}.csv`;
  return downloadBlob(url, filename);
}
