export type MerchantDetailProfile = {
  merchantName: string;
  areaName?: string | null;
  totalSku: number;
  stale30SkuCount: number;
  stale30Ratio: number;
};
export type MerchantDetailSku = {
  packageId: string;
  packageName: string;
  category: string;
  salePrice: number;
  stockLeft: number;
  lastSalesDate?: string | null;
  daysSinceLastSale?: number;
  staleBucket: string;
};
export type MerchantDetailCompetitor = {
  merchantName: string;
  category: string;
  skuCount: number;
  totalPrice: number;
};
export type MerchantDetailPanelProps = {
  detailLoading: boolean;
  profile: MerchantDetailProfile | null;
  skuList: MerchantDetailSku[];
  competitors: MerchantDetailCompetitor[];
  trendSummary: { totalGmv: number; conversionRate: number };
  trendOption: Record<string, unknown>;
  staleColor: (bucket: string) => string;
  staleLabel: (bucket: string) => string;
  // Residual #235: operator-selectable MerchantTrendQueryDto days (7–90).
  detailDays?: number;
  detailDayOptions?: readonly number[];
  // Residual #250: listSkus LIMIT honesty (server MERCHANT_SKU_LIST_LIMIT).
  skuTruncated?: boolean;
  skuLimit?: number | null;
  // Residual #285: MERCHANT_COMPETITORS_LIMIT Top-N honesty.
  competitorsTruncated?: boolean;
  competitorsLimit?: number | null;
  competitorsMatched?: number | null;
};
