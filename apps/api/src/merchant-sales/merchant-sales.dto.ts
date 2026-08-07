/** Consolidated merchant-sales module. */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { optionalDateKey, optionalString } from '../content/dto-decorators';

// --- dto/merchant-sales-query.dto.ts ---
export const MERCHANT_SALES_WINDOWS = ['day', 'week', 'month', 'year'] as const;
export type MerchantSalesWindow = (typeof MERCHANT_SALES_WINDOWS)[number];
export const MERCHANT_SALES_SORTS = [
  'gmvDesc',
  'refundDesc',
  'verifyDesc',
  'orderCountDesc'
] as const;
export type MerchantSalesSort = (typeof MERCHANT_SALES_SORTS)[number];
export class MerchantSalesQueryDto {
  @IsOptional() @IsIn([...MERCHANT_SALES_WINDOWS]) window: MerchantSalesWindow = 'day';
  @optionalDateKey() date?: string;
  @optionalDateKey() endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
  @IsOptional() @IsIn([...MERCHANT_SALES_SORTS]) sortBy: MerchantSalesSort = 'gmvDesc';
  @optionalString(5) force?: boolean | string;
  @optionalString(40) _?: string;
  @optionalString(40) _t?: string;
}
/** Strict YYYY-MM-DD only — see GmvRefreshBodyDto for why not IsDateString. */
export class MerchantSalesRefreshDto {
  @optionalDateKey() startDate?: string;
  @optionalDateKey() endDate?: string;
}

// --- merchant-sales.types.ts ---
export interface MerchantSalesSummary {
  window: MerchantSalesWindow;
  date: string;
  endDate: string;
  totalGmv: number;
  totalRefund: number;
  totalVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  merchantCount: number;
  packageCount: number;
  dataSource: 'MerchantDailyMetrics' | 'empty';
}
export interface MerchantSalesRankingRow {
  merchantName: string;
  areaName: string | null;
  gmv: number;
  gmvRefund: number;
  gmvVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  orderCount: number;
  packageCount: number;
}
export interface MerchantSalesRanking {
  items: MerchantSalesRankingRow[];
  /** Page math over the capped ranking head (not full merchant COUNT). */
  pagination: { page: number; pageSize: number; hasMore: boolean; total: number };
  /**
   * Residual #264: GMV_TOP_MERCHANTS_LIMIT honesty.
   * pagination.total is the capped head length used for page flips; when the
   * window has more merchants than the LIMIT, truncated=true and
   * totalMerchants is the real DISTINCT count.
   */
  limit?: number;
  truncated?: boolean;
  totalMerchants?: number;
}
export interface MerchantSalesTrendPoint {
  bucket: string;
  totalGmv: number;
  totalRefund: number;
  totalVerify: number;
  paidOrderCount: number;
}

// --- merchant-sales-tokens.ts ---
export const MERCHANT_SALES_SERVICE = 'MERCHANT_SALES_SERVICE';
