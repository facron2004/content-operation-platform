/** Consolidated zero-sales module. */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from 'class-validator';

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
  @IsOptional() @IsString() @MaxLength(64) merchantId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  merchantIds?: string[];
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(100) areaId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  areaIds?: string[];
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  /** lastSalesDateAsc (默认) | staleDesc | gmvDesc */
  @IsOptional()
  @IsIn(['lastSalesDateAsc', 'staleDesc', 'gmvDesc'])
  sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc' = 'lastSalesDateAsc';
  // Head window is ZERO_SALES_SKUS_CACHE_CAP (1000); page×pageSize must stay ≤ CAP.
  // page Max 20 @ pageSize 50 covers the full head; deeper pages are clamped in service.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 50;
}
export class ZeroSalesTimelineQueryDto {
  /** Interactive SKU timeline — cap at 90d (same class as merchant-sales/data-analysis). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(90) days: number = 30;
}

// --- dto/zero-sales-query.dto.ts ---
/** 零动销商家清单分页+过滤。默认按 stale_30d 过滤。 */
export class ZeroSalesMerchantsQueryDto {
  @IsOptional() @IsIn(STALE_BUCKETS as unknown as string[]) staleBucket: StaleBucket = 'stale_30d';
  @IsOptional() @IsString() @MaxLength(64) merchantId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  merchantIds?: string[];
  @IsOptional() @IsString() @MaxLength(100) areaId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  areaIds?: string[];
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page: number = 1;
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
export { csvEscape } from '../common/csv-escape';
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
