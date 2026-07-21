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
  updatedAt: string;
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
  pagination: { page: number; pageSize: number; hasMore: boolean };
};

export type MovementTimelineResponse = {
  packageId: string;
  days: number;
  timeline: Array<{ date: string; stockLeft: number; salesQty: number; deltaSource: string }>;
};

async function movementClient() {
  const { default: client } = await import('../http-client');
  return client;
}

export async function getMovementToday(date?: string) {
  return (
    await (
      await movementClient()
    ).get<MovementTodayPayload>('/movement/today', { params: { date } })
  ).data;
}

export async function getMovementTimeline(packageId: string, days = 30) {
  return (
    await (
      await movementClient()
    ).get<MovementTimelineResponse>(`/movement/skus/${packageId}/timeline`, { params: { days } })
  ).data;
}

export async function getMovementStagnant(params: {
  bucket?: StaleBucket;
  merchantId?: string;
  category?: string;
  areaId?: string;
  search?: string;
  sort?: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  page?: number;
  pageSize?: number;
}) {
  return (
    await (await movementClient()).get<MovementListResponse>('/movement/skus/stagnant', { params })
  ).data;
}

export async function getMovementMoving(params: {
  days?: 1 | 7 | 30;
  merchantId?: string;
  category?: string;
  areaId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await (await movementClient()).get<MovementListResponse>('/movement/skus/moving', { params })
  ).data;
}

export function getStagnantExportUrl(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const base = (import.meta.env.VITE_API_BASE_URL ?? '/api') + '/movement/skus/stagnant/export';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${qs.toString()}`;
}
