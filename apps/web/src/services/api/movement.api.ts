import client from '../http-client';
import { withForce } from './with-force';

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
  stale_7d: '7 天未销',
  stale_15d: '15 天未销',
  stale_30d: '30 天未销',
  stale_60d: '60 天未销'
};

export const STALE_BUCKET_COLORS: Record<StaleBucket, string> = {
  normal: '#10b981',
  stale_7d: '#fde68a',
  stale_15d: '#fb923c',
  stale_30d: '#ef4444',
  stale_60d: '#7f1d1d'
};

export interface MovementTodayPayload {
  date: string;
  activeSkus: number;
  movingSkus: number;
  stagnantSkus: number;
  movingRate: number;
  bucketDistribution: Array<{ bucket: StaleBucket; totalSku: number }>;
  updatedAt: string | null;
}

export interface MovementSkuRow {
  packageId: string;
  packageName: string;
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  category: string;
  salePrice: number;
  stockLeft: number;
  stockTotal: number;
  lastSalesDate: string | null;
  daysSinceLastSale: number;
  staleBucket: StaleBucket;
  recent30dSalesQty: number;
  recent30dSalesAmount: number;
}

export type MovementListResponse = {
  items: MovementSkuRow[];
  pagination: { page: number; pageSize: number; hasMore: boolean; total?: number };
  // Residual #266: MOVEMENT_CACHE_CAP honesty.
  limit?: number;
  truncated?: boolean;
};

export type MovementTimelineResponse = {
  packageId: string;
  days: number;
  timeline: Array<{ date: string; stockLeft: number; salesQty: number; deltaSource: string }>;
};

export async function getMovementToday(date?: string, force = false) {
  return (
    await client.get<MovementTodayPayload>(withForce('/movement/today', force), {
      params: { date }
    })
  ).data;
}

export async function getMovementTimeline(packageId: string, days = 30) {
  return (
    await client.get<MovementTimelineResponse>(`/movement/skus/${packageId}/timeline`, {
      params: { days }
    })
  ).data;
}

export async function getMovementStagnant(
  params: {
    bucket?: StaleBucket;
    merchantId?: string;
    category?: string;
    areaId?: string;
    search?: string;
    sort?: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
    page?: number;
    pageSize?: number;
  },
  force = false
) {
  return (
    await client.get<MovementListResponse>(withForce('/movement/skus/stagnant', force), { params })
  ).data;
}

export async function getMovementMoving(
  params: {
    days?: 1 | 7 | 30;
    merchantId?: string;
    category?: string;
    areaId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  },
  force = false
) {
  return (
    await client.get<MovementListResponse>(withForce('/movement/skus/moving', force), { params })
  ).data;
}

/** Relative path for axios client (baseURL already includes /api). */
export function getStagnantExportUrl(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const q = qs.toString();
  return q ? `/movement/skus/stagnant/export?${q}` : '/movement/skus/stagnant/export';
}
