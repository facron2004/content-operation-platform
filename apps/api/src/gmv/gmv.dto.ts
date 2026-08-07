/** Consolidated GMV module. */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { optionalDateKey, optionalString } from '../content/dto-decorators';

// --- dto/gmv-query.types.ts ---
// Interactive money reads share the 90d cap with merchant-sales / data-analysis.
// days=365 used to force a full-year DailyMetrics (or OrderHeader fallback) scan.
export const TREND_WINDOW_OPTIONS = [7, 30, 90] as const;
export type TrendWindow = (typeof TREND_WINDOW_OPTIONS)[number];

export const TREND_GRANULARITY_OPTIONS = ['day', 'week', 'month'] as const;
export type TrendGranularity = (typeof TREND_GRANULARITY_OPTIONS)[number];

export type GmvDistributionDim = 'area' | 'category' | 'channel';
export const GMV_DISTRIBUTION_DIMS: readonly GmvDistributionDim[] = [
  'area',
  'category',
  'channel'
] as const;

export type GmvMerchantSort = 'gmvDesc' | 'refundDesc' | 'verifyDesc';
export const GMV_MERCHANT_SORTS: readonly GmvMerchantSort[] = [
  'gmvDesc',
  'refundDesc',
  'verifyDesc'
] as const;

// --- dto/gmv-query-core.dto.ts ---

export class GmvTodayQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 必须为 YYYY-MM-DD 格式' })
  date?: string;

  @optionalString(5)
  force?: boolean | string;

  @optionalString(40)
  _?: string;

  @optionalString(40)
  _t?: string;
}

export class GmvTrendQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...TREND_WINDOW_OPTIONS])
  days: TrendWindow = 30;

  @IsOptional()
  @IsString()
  @IsIn([...TREND_GRANULARITY_OPTIONS])
  granularity: TrendGranularity = 'day';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate 必须为 YYYY-MM-DD 格式' })
  endDate?: string;

  @optionalString(5)
  force?: boolean | string;

  @optionalString(40)
  _?: string;

  @optionalString(40)
  _t?: string;
}

export class GmvHourlyQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 必须为 YYYY-MM-DD 格式' })
  date?: string;

  @optionalString(5)
  force?: boolean | string;

  @optionalString(40)
  _?: string;

  @optionalString(40)
  _t?: string;
}

// --- dto/gmv-query-extra.dto.ts ---
export class GmvDistributionQueryDto {
  @IsOptional() @IsIn([...GMV_DISTRIBUTION_DIMS]) dim: GmvDistributionDim = 'area';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 20;
  @optionalString(5) force?: boolean | string;
  @optionalString(40) _?: string;
  @optionalString(40) _t?: string;
}
export class GmvByMerchantQueryDto {
  @IsOptional() @IsIn([...GMV_MERCHANT_SORTS]) sortBy: GmvMerchantSort = 'gmvDesc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
  @optionalString(5) force?: boolean | string;
  @optionalString(40) _?: string;
  @optionalString(40) _t?: string;
}

// --- dto/gmv-refresh.dto.ts ---
/**
 * GMV 手动刷新请求体 — 严格 YYYY-MM-DD（不是 IsDateString）。
 * IsDateString 会放行 ISO datetime，而 daysBetween 只认 YYYY-MM-DD，
 * 两者错位会把多年区间算成 span=0 从而绕过 90 天上限。
 */
export class GmvRefreshBodyDto {
  @optionalDateKey() startDate?: string;
  @optionalDateKey() endDate?: string;
}

// --- gmv.types.ts ---
export interface GmvCompareDelta {
  /** 相对前一日的环比（兼容层，前端依赖 Float 字段） */
  totalGmv?: number | null;
  totalGmvFen?: number | null;
  paidOrderCount?: number | null;
  avgOrderValue?: number | null;
  refundRate?: number | null;
  verifyRate?: number | null;
  monthGmv?: number | null;
  monthGmvFen?: number | null;
}

export interface GmvTodayPayload {
  date: string;
  /** 今日 GMV（元，兼容层，前端依赖 Float 字段） */
  totalGmv: number;
  /** 本月累计 GMV（元，兼容层） */
  monthGmv: number;
  totalGmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  gmvCardFen: bigint | null;
  totalRefundFen: bigint | null;
  refundRate: number;
  refundOrderCount: number;
  verifyOrderCount: number;
  totalVerifyFen: bigint | null;
  verifyRate: number;
  paidOrderCount: number;
  paidAmountBonusFen: bigint | null;
  paidAmountWalletFen: bigint | null;
  /** 客单价 = totalGmv / paidOrderCount */
  avgOrderValue: number;
  /** 本月累计 GMV（月初至 date，含当天） */
  monthGmvFen: bigint | null;
  /** 本月累计 现金/在线支付金额 */
  monthGmvOnlineFen: bigint | null;
  /** 本月累计 余额支付金额 */
  monthGmvWalletFen: bigint | null;
  /** 平台佣金收入（暂无订单级佣金，固定 0 并披露） */
  platformCommission: number;
  /** 相对前一日（或上月同期）的环比 */
  compare?: GmvCompareDelta;
  updatedAt: string;
  dataSource: 'DailyMetrics' | 'OrderHeader' | 'empty';
}

export interface GmvTrendPoint {
  date: string;
  /** 当日 GMV（元，兼容层） */
  totalGmv: number;
  totalGmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  totalRefundFen: bigint | null;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
  /** 退款单数（单数口径分母/分子） */
  refundCount?: number;
  /** 核销单数（单数口径分母/分子） */
  verifyCount?: number;
}

export interface GmvHourlyPoint {
  hour: number;
  label: string;
  totalGmvFen: bigint | null;
  paidOrderCount: number;
}

export interface GmvDistributionRow {
  key: string;
  totalGmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  share: number;
}

/** Residual #289: Top-N named-bucket head + honesty for /gmv/distribution. */
export interface GmvDistributionPayload {
  items: GmvDistributionRow[];
  /** Requested named-bucket head (GmvDistributionQueryDto.limit). */
  limit: number;
  /**
   * Named buckets matched before head clip (excludes synthetic 「其他」).
   * When truncated, this is at-least `limit + 1` (long-tail remainder exists).
   */
  matched: number;
  /** true when head GMV < platform total (「其他」 long-tail present). */
  truncated: boolean;
}

// --- gmv-empty.ts ---
export const emptyTrendPoint = (date = ''): GmvTrendPoint => ({
  date,
  totalGmv: 0,
  totalGmvFen: 0n,
  gmvOnlineFen: 0n,
  gmvWalletFen: 0n,
  gmvBonusFen: 0n,
  totalRefundFen: 0n,
  refundRate: 0,
  verifyRate: 0,
  paidOrderCount: 0,
  refundCount: 0,
  verifyCount: 0
});

export const emptyTodayPayload = (
  date: string,
  dataSource: GmvTodayPayload['dataSource']
): GmvTodayPayload => ({
  date,
  totalGmv: 0,
  monthGmv: 0,
  totalGmvFen: 0n,
  gmvOnlineFen: 0n,
  gmvWalletFen: 0n,
  gmvBonusFen: 0n,
  gmvCardFen: 0n,
  totalRefundFen: 0n,
  refundRate: 0,
  refundOrderCount: 0,
  verifyOrderCount: 0,
  totalVerifyFen: 0n,
  verifyRate: 0,
  paidOrderCount: 0,
  paidAmountBonusFen: 0n,
  paidAmountWalletFen: 0n,
  avgOrderValue: 0,
  monthGmvFen: 0n,
  monthGmvOnlineFen: 0n,
  monthGmvWalletFen: 0n,
  platformCommission: 0,
  updatedAt: new Date().toISOString(),
  dataSource
});

export const emptyHourlyPoints = (): GmvHourlyPoint[] =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    totalGmvFen: 0n,
    paidOrderCount: 0
  }));

// --- gmv-merchant-row.ts ---
export interface GmvMerchantRow {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  gmvFen: bigint | null;
  gmvRefundFen: bigint | null;
  gmvVerifyFen: bigint | null;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}
