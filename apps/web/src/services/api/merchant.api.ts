import type { StaleBucket } from './zero-sales.api';
import client from '../http-client';

export interface MerchantListItem {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
  stale30SkuCount: number;
  stale30Ratio: number;
  totalGmv30d: number;
}

export interface MerchantListResponse {
  items: MerchantListItem[];
  pagination: { page: number; pageSize: number; hasMore: boolean; total?: number };
  // Residual #266: MERCHANT_LIST_CACHE_CAP honesty.
  limit?: number;
  truncated?: boolean;
}

export interface MerchantProfile {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
  stale30SkuCount: number;
  stale30Ratio: number;
}

export interface MerchantTrendPoint {
  date: string;
  gmv: number;
  paidOrderCount: number;
  orderCount: number;
  exposureCount: number;
  clickCount: number;
  conversionRate: number;
}

export interface MerchantTrendResponse {
  merchantId: string;
  days: number;
  trend: MerchantTrendPoint[];
}

export interface MerchantSkuItem {
  packageId: string;
  packageName: string;
  areaName: string;
  category: string;
  salePrice: number;
  stockLeft: number;
  lastSalesDate: string | null;
  daysSinceLastSale: number;
  staleBucket: StaleBucket;
}

export interface MerchantSkuListResponse {
  merchantId: string;
  count: number;
  items: MerchantSkuItem[];
  // Residual #246: echo of the sales-join window used server-side.
  days?: number;
  // Residual #250: SQL LIMIT honesty — SPA warns when list is truncated.
  limit?: number;
  truncated?: boolean;
}

export interface MerchantCompetitor {
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  skuCount: number;
  totalPrice: number;
}

export interface MerchantCompetitorsResponse {
  merchantId: string;
  competitors: MerchantCompetitor[];
  /** Residual #285: MERCHANT_COMPETITORS_LIMIT Top-N head. */
  limit?: number;
  /**
   * Residual #285: matched before head clip.
   * When truncated, at-least limit+1 (LIMIT+1 probe), not full COUNT.
   */
  matched?: number;
  truncated?: boolean;
}

export async function listMerchants(params: {
  areaId?: string;
  search?: string;
  sort?: 'stale30Desc' | 'totalSkuDesc' | 'totalGmvDesc';
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<MerchantListResponse>('/merchants', { params })).data;
}

export async function getMerchantProfile(merchantId: string) {
  return (await client.get<MerchantProfile>(`/merchants/${merchantId}/profile`)).data;
}

export async function getMerchantTrend(merchantId: string, days = 30) {
  return (
    await client.get<MerchantTrendResponse>(`/merchants/${merchantId}/trend`, { params: { days } })
  ).data;
}

export async function getMerchantSkus(merchantId: string, days = 30) {
  const res = await client.get<MerchantSkuListResponse>(`/merchants/${merchantId}/skus`, {
    params: { days }
  });
  return res.data;
}

export async function getMerchantCompetitors(merchantId: string) {
  const res = await client.get<MerchantCompetitorsResponse>(`/merchants/${merchantId}/competitors`);
  return res.data;
}

// ── Heatmap ──────────────────────────────────────────

export interface MerchantHeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
  areaName: string;
  merchantCount: number;
  totalGmv: number;
  merchants: string[];
}

export interface MerchantHeatmapResponse {
  points: MerchantHeatmapPoint[];
  totalMerchants: number;
  mappedMerchants: number;
  unmappedMerchants: number;
  center: { lat: number; lng: number };
  // Residual #269: PLATFORM_SCAN_LIMIT honesty.
  limit?: number;
  truncated?: boolean;
}

export async function getMerchantHeatmap() {
  return (await client.get<MerchantHeatmapResponse>('/merchants/heatmap')).data;
}
