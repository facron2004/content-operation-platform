import type { StaleBucket } from './movement.dto';

export type ActiveSkuCandidate = {
  packageId: string;
  packageName: string;
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  category: string;
  salePrice: number;
  stockLeft: number;
  stockTotal: number;
};

export const STALE_THRESHOLDS = {
  stale7Days: 7,
  stale15Days: 15,
  stale30Days: 30,
  stale60Days: 60
} as const;

export const STALE_BUCKET_ORDER: StaleBucket[] = [
  'stale_60d',
  'stale_30d',
  'stale_15d',
  'stale_7d',
  'normal'
];

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

export interface MovementTimelinePoint {
  date: string;
  stockLeft: number;
  salesQty: number;
  deltaSource: string;
}

export interface MovementTimelineResponse {
  packageId: string;
  days: number;
  timeline: MovementTimelinePoint[];
}
