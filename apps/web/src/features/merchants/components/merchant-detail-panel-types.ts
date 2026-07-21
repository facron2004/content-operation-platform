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
};
