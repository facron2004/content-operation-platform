export interface OverviewKpiPayload {
  date: string;
  totalMerchants: number;
  totalSkus: number;
  zeroSalesMerchants: number;
  zeroSalesSkuCount: number;
  zeroSalesSkuRatio: number;
  todayGmvFen: bigint | null;
  todayOrderCount: number;
  updatedAt: string;
  /** Money fields use OrderHeader/DailyMetrics; inventory stale is separate. */
  dataSource: 'OrderHeader' | 'DailyMetrics' | 'empty' | string;
}

export interface OverviewTrendPoint {
  date: string;
  gmv: number;
  paidOrderCount: number;
}

export interface OverviewDistributionRow {
  key: string;
  totalSku: number;
  stockLeft: number;
}

export interface OverviewTopOffender {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  stale30SkuCount: number;
  totalSku: number;
}
