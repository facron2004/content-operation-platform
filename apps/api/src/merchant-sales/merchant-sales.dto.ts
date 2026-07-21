/** Consolidated merchant-sales module. */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 20;
  @IsOptional() @IsIn([...MERCHANT_SALES_SORTS]) sortBy: MerchantSalesSort = 'gmvDesc';
  @IsOptional() force?: boolean | string;
}
export class MerchantSalesRefreshDto {
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
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
  pagination: { page: number; pageSize: number; hasMore: boolean; total: number };
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
