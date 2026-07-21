/** Consolidated refund module. */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// --- dto/refund-query.dto.ts ---
export const REFUND_TREND_WINDOW = [7, 30] as const;
export const VERIFY_TREND_WINDOW = [7, 30] as const;
export type TrendWindow = 7 | 30;
export class RefundTodayQueryDto {
  @IsOptional() @IsString() date?: string;
}
export class RefundTrendQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([7, 30]) days: TrendWindow = 7;
  @IsOptional() @IsString() endDate?: string;
}
export class RefundTopMerchantsQueryDto {
  @IsOptional() @IsIn(['refundDesc', 'verifyDesc']) sortBy: 'refundDesc' | 'verifyDesc' =
    'refundDesc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
}

// --- refund-today.types.ts ---
export interface RefundTodayPayload {
  date: string;
  totalRefund: number;
  totalGmv: number;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
  topRefundMerchants: Array<{
    merchantId: string;
    merchantName: string;
    gmv: number;
    refund: number;
    refundRate: number;
  }>;
  updatedAt: string;
}
export interface RefundTrendPoint {
  date: string;
  totalRefund: number;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
}

// --- refund-verify.types.ts ---
export interface RefundVerifyTodayPayload {
  date: string;
  totalVerify: number;
  totalGmv: number;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
  topVerifyMerchants: Array<{
    merchantId: string;
    merchantName: string;
    gmv: number;
    verify: number;
    verifyRate: number;
  }>;
  updatedAt: string;
}
export interface VerifyTrendPoint {
  date: string;
  totalVerify: number;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
}
export interface TopMerchantRow {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  gmv: number;
  refund: number;
  verify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}
