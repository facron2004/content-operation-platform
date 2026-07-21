export interface SalesSnapshot {
  packageId: string;
  areaId: string;
  merchantId: string;
  snapshotTime: string;
  exposureCount: number;
  clickCount: number;
  orderCount: number;
  paidOrderCount: number;
  refundCount: number;
  verifyCount: number;
  gmv: number;
  paidAmount: number;
  refundAmount: number;
  conversionRate: number;
  verifyRate: number;
  refundRate: number;
  sellThroughRate: number;
  remainingStock: number;
  salesSpeed: number;
}
