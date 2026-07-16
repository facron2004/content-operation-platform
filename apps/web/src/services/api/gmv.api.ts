// ===== 中台 GMV 看板 API 类型 =====

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
  updatedAt: string;
  dataSource: 'DailyMetrics' | 'SalesSnapshot';
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

export interface GmvDistributionRow {
  key: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  share: number;
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

export async function refreshGmvFromJeesite(startDate?: string, endDate?: string) {
  const { default: client } = await import('../http-client');
  const res = await client.post<{
    startDate: string;
    endDate: string;
    fetched: number;
    upserted: number;
    skipped: number;
    errors: number;
    pagesFetched: number;
    kpi: GmvKpi;
  }>(`/gmv/refresh?_=${Date.now()}`, { startDate, endDate });
  return res.data;
}

export async function getGmvToday(date?: string, force = false) {
  const { default: client } = await import('../http-client');
  // force=true 同时拼 ?_=ts(防 axios 缓存/AbortController) + ?force=true(告诉后端绕过 5min 缓存)
  const suffix = force ? `?_=${Date.now()}&force=true` : '';
  const url = `/gmv/today${suffix}`;
  const res = await client.get<GmvKpi>(url, { params: date ? { date } : undefined });
  return res.data;
}

export async function getGmvTrend(days: 7 | 30, endDate?: string, force = false) {
  const { default: client } = await import('../http-client');
  const suffix = force ? `?_=${Date.now()}&force=true` : '';
  const url = `/gmv/trend${suffix}`;
  const params: Record<string, unknown> = { days };
  if (endDate) params.endDate = endDate;
  const res = await client.get<GmvTrendPoint[]>(url, { params });
  return res.data;
}

export async function getGmvDistribution(
  dim: 'area' | 'category' | 'channel',
  limit = 20,
  force = false
) {
  const { default: client } = await import('../http-client');
  const suffix = force ? `?_=${Date.now()}&force=true` : '';
  const url = `/gmv/distribution${suffix}`;
  const res = await client.get<GmvDistributionRow[]>(url, {
    params: { dim, limit }
  });
  return res.data;
}

export async function getGmvByMerchant(
  sortBy: 'gmvDesc' | 'refundDesc' | 'verifyDesc' = 'gmvDesc',
  page = 1,
  pageSize = 20,
  force = false
) {
  const { default: client } = await import('../http-client');
  const suffix = force ? `?_=${Date.now()}&force=true` : '';
  const url = `/gmv/by-merchant${suffix}`;
  const res = await client.get<{ items: GmvMerchantRow[]; hasMore: boolean }>(url, {
    params: { sortBy, page, pageSize }
  });
  return res.data;
}
