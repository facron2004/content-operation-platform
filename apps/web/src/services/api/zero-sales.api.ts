import client from '../http-client';

export type StaleBucket = 'normal' | 'stale_7d' | 'stale_15d' | 'stale_30d' | 'stale_60d';

export const STALE_BUCKETS: readonly StaleBucket[] = [
  'normal',
  'stale_7d',
  'stale_15d',
  'stale_30d',
  'stale_60d'
] as const;

export const STALE_BUCKET_LABELS: Record<StaleBucket, string> = {
  normal: '正常',
  stale_7d: '7天未销',
  stale_15d: '15天未销',
  stale_30d: '30天未销',
  stale_60d: '60天未销'
};

export const STALE_BUCKET_COLORS: Record<StaleBucket, string> = {
  normal: '#10b981',
  stale_7d: '#fde68a',
  stale_15d: '#fb923c',
  stale_30d: '#ef4444',
  stale_60d: '#7f1d1d'
};

export interface ZeroSalesMerchantRow {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  areaId: string | null;
  totalSku: number;
  staleSkuCount: number;
  staleGmv30d: number;
  lastSalesDate: string | null;
}

export interface ZeroSalesSkuRow {
  packageId: string;
  packageName: string;
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  salePrice: number;
  stockLeft: number;
  stockTotal: number;
  lastSalesDate: string | null;
  daysSinceLastSale: number;
  staleBucket: StaleBucket;
  staleGmv30d: number;
  staleSalesQty30d: number;
}

export interface ZeroSalesListResponse<T> {
  items: T[];
  pagination: { page: number; pageSize: number; hasMore: boolean; total?: number };
}

export interface ZeroSalesTimelinePoint {
  date: string;
  stockLeft: number;
  salesQty: number;
  deltaSource: string;
}

export interface ZeroSalesTimelineResponse {
  packageId: string;
  days: number;
  timeline: ZeroSalesTimelinePoint[];
}

export async function getZeroSalesMerchants(params: {
  staleBucket?: StaleBucket;
  merchantId?: string;
  areaId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<ZeroSalesListResponse<ZeroSalesMerchantRow>>('/zero-sales/merchants', {
      params
    })
  ).data;
}

export async function getZeroSalesSkus(params: {
  staleBucket?: StaleBucket;
  merchantId?: string;
  category?: string;
  areaId?: string;
  search?: string;
  sort?: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<ZeroSalesListResponse<ZeroSalesSkuRow>>('/zero-sales/skus', { params }))
    .data;
}

export async function getZeroSalesTimeline(packageId: string, days = 30) {
  const res = await client.get<ZeroSalesTimelineResponse>(
    `/zero-sales/skus/${packageId}/timeline`,
    { params: { days } }
  );
  return res.data;
}

/** 触发浏览器下载 CSV（拼接 URL,避免 axios 流式响应配置） */
export function getZeroSalesExportUrl(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const base = (import.meta.env.VITE_API_BASE_URL ?? '/api') + '/zero-sales/skus/export';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${qs.toString()}`;
}
