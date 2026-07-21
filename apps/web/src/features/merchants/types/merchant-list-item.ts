export type MerchantListItem = {
  merchantId: string;
  merchantName: string;
  areaName?: string | null;
  totalSku: number;
  totalGmv30d: number;
  stale30Ratio: number;
};
