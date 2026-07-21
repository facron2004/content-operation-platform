/** Consolidated zero-sales module. */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// --- dto/zero-sales-stale.ts ---
export type StaleBucket = 'normal' | 'stale_7d' | 'stale_15d' | 'stale_30d' | 'stale_60d';
export const STALE_BUCKETS: readonly StaleBucket[] = [
  'normal',
  'stale_7d',
  'stale_15d',
  'stale_30d',
  'stale_60d'
] as const;

// --- dto/zero-sales-skus.dto.ts ---
export class ZeroSalesSkusQueryDto {
  @IsOptional() @IsIn(STALE_BUCKETS as unknown as string[]) staleBucket?: StaleBucket;
  @IsOptional() @IsString() merchantId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() areaId?: string;
  @IsOptional() @IsString() search?: string;
  /** lastSalesDateAsc (默认) | staleDesc | gmvDesc */
  @IsOptional()
  @IsIn(['lastSalesDateAsc', 'staleDesc', 'gmvDesc'])
  sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc' = 'lastSalesDateAsc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 50;
}
export class ZeroSalesTimelineQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(180) days: number = 30;
}

// --- dto/zero-sales-query.dto.ts ---
/** 零动销商家清单分页+过滤。默认按 stale_30d 过滤。 */
export class ZeroSalesMerchantsQueryDto {
  @IsOptional() @IsIn(STALE_BUCKETS as unknown as string[]) staleBucket: StaleBucket = 'stale_30d';
  @IsOptional() @IsString() merchantId?: string;
  @IsOptional() @IsString() areaId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
}

// --- zero-sales-candidate-types.ts ---
export type CandidateRow = {
  packageId: string;
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  areaId: string | null;
};
export type MerchantAcc = {
  merchantId: string;
  merchantName: string;
  areaName: string;
  areaId: string;
  packageIds: string[];
};

// --- zero-sales-sku-types.ts ---
export type ZeroSalesSkuRow = {
  packageId: string;
  packageName: string;
  merchantId: string;
  merchantName: string;
  areaName: string;
  category: string;
  salePrice: number;
  stockLeft: number;
  stockTotal: number;
  lastSalesDate: string | null;
  daysSinceLastSale: number | null;
  staleGmv30d: number;
  staleSalesQty30d: number;
};

// --- zero-sales-csv-types.ts ---
export function csvEscape(s: string): string {
  if (s == null) return '';
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
export const ZERO_SALES_SKU_CSV_HEADER = [
  'packageId',
  'packageName',
  'merchantName',
  'areaName',
  'category',
  'salePrice',
  'stockLeft',
  'stockTotal',
  'lastSalesDate',
  'daysSinceLastSale',
  'staleBucket',
  'staleGmv30d',
  'staleSalesQty30d'
] as const;
export type ZeroSalesSkuCsvItem = {
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  category: string;
  salePrice: number;
  stockLeft: number;
  stockTotal: number;
  lastSalesDate: string | null;
  daysSinceLastSale: number;
  staleBucket: string;
  staleGmv30d: number;
  staleSalesQty30d: number;
};
