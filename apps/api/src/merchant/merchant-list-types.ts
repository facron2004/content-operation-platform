/** Shared row and projection types for merchant list readers. */
export type MerchantListItem = {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
  stale30SkuCount: number;
  stale30Ratio: number;
  totalGmv30d: number;
};

export type MerchantRow = {
  merchantId: string;
  merchantName: string;
  areaId: string | null;
  areaName: string | null;
  totalSku: number;
};
