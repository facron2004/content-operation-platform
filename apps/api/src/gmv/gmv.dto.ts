/** Consolidated GMV module. */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { optionalDateKey } from '../content/dto-decorators';

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

  @IsOptional()
  force?: boolean | string;
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

  @IsOptional()
  force?: boolean | string;
}

export class GmvHourlyQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 必须为 YYYY-MM-DD 格式' })
  date?: string;

  @IsOptional()
  force?: boolean | string;
}

// --- dto/gmv-query-extra.dto.ts ---
export class GmvDistributionQueryDto {
  @IsOptional() @IsIn([...GMV_DISTRIBUTION_DIMS]) dim: GmvDistributionDim = 'area';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 20;
  @IsOptional() force?: boolean | string;
}
export class GmvByMerchantQueryDto {
  @IsOptional() @IsIn([...GMV_MERCHANT_SORTS]) sortBy: GmvMerchantSort = 'gmvDesc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
  @IsOptional() force?: boolean | string;
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
  totalGmv?: number | null;
  paidOrderCount?: number | null;
  avgOrderValue?: number | null;
  refundRate?: number | null;
  verifyRate?: number | null;
  monthGmv?: number | null;
}

export interface GmvTodayPayload {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  gmvCard: number;
  totalRefund: number;
  refundRate: number;
  totalVerify: number;
  verifyRate: number;
  paidOrderCount: number;
  paidAmountBonus: number;
  paidAmountWallet: number;
  /** 客单价 = totalGmv / paidOrderCount */
  avgOrderValue: number;
  /** 本月累计 GMV（月初至 date，含当天） */
  monthGmv: number;
  /** 本月累计 现金/在线支付金额 */
  monthGmvOnline: number;
  /** 本月累计 余额支付金额 */
  monthGmvWallet: number;
  /** 平台佣金收入（暂无订单级佣金，固定 0 并披露） */
  platformCommission: number;
  /** 相对前一日（或上月同期）的环比 */
  compare?: GmvCompareDelta;
  updatedAt: string;
  dataSource: 'DailyMetrics' | 'OrderHeader' | 'empty';
}

export interface GmvTrendPoint {
  date: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
  totalRefund: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}

export interface GmvHourlyPoint {
  hour: number;
  label: string;
  totalGmv: number;
  paidOrderCount: number;
}

export interface GmvDistributionRow {
  key: string;
  totalGmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
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
  gmvOnline: 0,
  gmvWallet: 0,
  gmvBonus: 0,
  totalRefund: 0,
  refundRate: 0,
  verifyRate: 0,
  paidOrderCount: 0
});

export const emptyTodayPayload = (
  date: string,
  dataSource: GmvTodayPayload['dataSource']
): GmvTodayPayload => ({
  date,
  totalGmv: 0,
  gmvOnline: 0,
  gmvWallet: 0,
  gmvBonus: 0,
  gmvCard: 0,
  totalRefund: 0,
  refundRate: 0,
  totalVerify: 0,
  verifyRate: 0,
  paidOrderCount: 0,
  paidAmountBonus: 0,
  paidAmountWallet: 0,
  avgOrderValue: 0,
  monthGmv: 0,
  monthGmvOnline: 0,
  monthGmvWallet: 0,
  platformCommission: 0,
  updatedAt: new Date().toISOString(),
  dataSource
});

export const emptyHourlyPoints = (): GmvHourlyPoint[] =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    totalGmv: 0,
    paidOrderCount: 0
  }));

// --- gmv-merchant-row.ts ---
export interface GmvMerchantRow {
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  gmv: number;
  gmvRefund: number;
  gmvVerify: number;
  refundRate: number;
  verifyRate: number;
  paidOrderCount: number;
}
