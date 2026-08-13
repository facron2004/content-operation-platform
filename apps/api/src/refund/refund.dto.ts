/** Consolidated refund module. */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { optionalDateKey, optionalString } from '../content/dto-decorators';
import type { RefundWindow } from './refund-top-merchants';

export type TrendBucket = 'day' | 'week' | 'month' | 'year';

// --- dto/refund-query.dto.ts ---
export const REFUND_TREND_WINDOW = [7, 30] as const;
export const VERIFY_TREND_WINDOW = [7, 30] as const;
export type TrendWindow = 7 | 30;
export class RefundTodayQueryDto {
  @optionalDateKey() date?: string;
  /** 口径周期: 日/周/月/年 — 默认 day(今日)。 */
  @IsOptional() @IsIn(['day', 'week', 'month', 'year']) window?: RefundWindow;
  @optionalString(5) force?: boolean | string;
}
export class RefundTrendQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([7, 30]) days: TrendWindow = 7;
  @optionalDateKey() endDate?: string;
  /** 趋势聚合粒度: 逐日/按周/按月/按年(默认 day)。 */
  @IsOptional() @IsIn(['day', 'week', 'month', 'year']) bucket?: TrendBucket;
  @optionalString(5) force?: boolean | string;
}
export class RefundTopMerchantsQueryDto {
  @IsOptional() @IsIn(['refundDesc', 'verifyDesc']) sortBy: 'refundDesc' | 'verifyDesc' =
    'refundDesc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
  /** 口径周期: 日/周/月/年 — 默认 week(近7日), 与历史"高退款商家"口径一致。 */
  @IsOptional() @IsIn(['day', 'week', 'month', 'year']) window?: RefundWindow;
  /** 周期锚点日期(可选);不传则取今日。 */
  @optionalDateKey() date?: string;
  @optionalString(5) force?: boolean | string;
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
  updatedAt: string | null;
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
  updatedAt: string | null;
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
