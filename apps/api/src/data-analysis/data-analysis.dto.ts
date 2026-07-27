/** Data-analysis report DTOs and types (砍价订单模板). */
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { optionalDateKey } from '../content/dto-decorators';

export const DATA_ANALYSIS_WINDOWS = ['day', 'week', 'month', 'year'] as const;
export type DataAnalysisWindow = (typeof DATA_ANALYSIS_WINDOWS)[number];

/** Daily sales target used by 总览「目标达成比」 (matches product template 3.3w). */
export const DATA_ANALYSIS_TARGET_AMOUNT = 33_000;

export class DataAnalysisQueryDto {
  @IsOptional()
  @IsIn([...DATA_ANALYSIS_WINDOWS])
  window: DataAnalysisWindow = 'day';

  @optionalDateKey()
  date?: string;

  @optionalDateKey()
  endDate?: string;

  /** Order-detail sheet row cap (default 2000, max 2000). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000)
  detailLimit?: number;

  /** Ranking sheet row cap (default 500, max 1000). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  rankingLimit?: number;
}

export interface DataAnalysisOverview {
  orderCount: number;
  /** 销售额(实付) = SUM(paidAmount) */
  salesAmount: number;
  /** 余额抵扣 = SUM(paidAmountWallet) */
  walletAmount: number;
  /** 交易额(含余额) = sales + wallet */
  tradeAmount: number;
  /** 净销售额 = sales − refund */
  netSales: number;
  /** 券面额合计 = SUM(orderAmount) */
  faceAmount: number;
  refundAmount: number;
  /** 已核销金额 = SUM(verifyAmount) */
  verifyAmount: number;
  /** 核销率 = verifiedCount / orderCount */
  verifyRate: number;
  /** 退款率 = refundAmount / salesAmount */
  refundRate: number;
  /** 整体结算率 = verifyAmount / tradeAmount（核销金额含余额，分母须用含余额交易额） */
  settlementRate: number;
  /** 客单价 = sales / orderCount */
  avgOrderValue: number;
  /** 目标达成比 = sales / TARGET */
  targetRatio: number;
  /** 目标达成(含余额) = trade / TARGET */
  targetRatioWithWallet: number;
  verifiedCount: number;
  pendingVerifyCount: number;
  expiredCount: number;
  merchantCount: number;
  salesmanCount: number;
}

/** 相对上周期的变化比（(curr-prev)/prev；prev=0 时为 null）。 */
export interface DataAnalysisDeltas {
  orderCount: number | null;
  salesAmount: number | null;
  tradeAmount: number | null;
  netSales: number | null;
  refundAmount: number | null;
  verifyRate: number | null;
  refundRate: number | null;
  settlementRate: number | null;
  avgOrderValue: number | null;
}

/** 按日趋势点（北京日历日）。 */
export interface DataAnalysisDailyPoint {
  date: string;
  salesAmount: number;
  tradeAmount: number;
  netSales: number;
  orderCount: number;
  refundAmount: number;
}

/** 渠道销售占比。 */
export interface DataAnalysisChannelSlice {
  channel: string;
  label: string;
  salesAmount: number;
  orderCount: number;
  share: number;
}

/** 热门商品 TOP。 */
export interface DataAnalysisPackageRankRow {
  rank: number;
  packageId: string;
  packageName: string;
  salesAmount: number;
  orderCount: number;
}

/** 指标明细表的固定窗口快照（今日/昨日/近7/近30）。 */
export type DataAnalysisSnapshotKey = 'today' | 'yesterday' | 'last7' | 'last30';

export interface DataAnalysisWindowSnapshot {
  key: DataAnalysisSnapshotKey;
  label: string;
  start: string;
  end: string;
  overview: DataAnalysisOverview;
}

export interface DataAnalysisTimeSlotRow {
  label: string;
  orderCount: number;
  salesAmount: number;
  verifiedCount: number;
  verifyRate: number;
}

export interface DataAnalysisHourlyRow {
  hour: number;
  orderCount: number;
  salesAmount: number;
}

export interface DataAnalysisRankRow {
  rank: number;
  name: string;
  orderCount: number;
  salesAmount: number;
  faceAmount: number;
  walletAmount: number;
  refundAmount: number;
  verifiedCount: number;
  verifyRate: number;
  avgOrderValue: number;
}

export interface DataAnalysisRateRow {
  name: string;
  orderCount: number;
  verifyRate: number;
}

export interface DataAnalysisRefundRow {
  name: string;
  orderCount: number;
  refundAmount: number;
  verifyRate: number;
}

export interface DataAnalysisOrderDetailRow {
  merchantName: string;
  orderId: string;
  packageName: string;
  memberLabel: string;
  paidAmount: number;
  orderAmount: number;
  walletAmount: number;
  pointUsed: number;
  refundAmount: number;
  coupon: string;
  salesman: string;
  parentSalesman: string;
  statusLabel: string;
  orderType: string;
  verifyLabel: string;
  paidTime: string;
  verifyTime: string;
}

export interface DataAnalysisReport {
  window: DataAnalysisWindow;
  date: string;
  endDate: string;
  generatedAt: string;
  /** True when layout matches product 砍价订单 template. */
  templateReady: boolean;
  overview: DataAnalysisOverview;
  timeSlots: DataAnalysisTimeSlotRow[];
  hourly: DataAnalysisHourlyRow[];
  salesmen: DataAnalysisRankRow[];
  merchants: DataAnalysisRankRow[];
  merchantVerifyLow: DataAnalysisRateRow[];
  merchantVerifyHigh: DataAnalysisRateRow[];
  salesmanVerifyLow: DataAnalysisRateRow[];
  salesmanVerifyHigh: DataAnalysisRateRow[];
  merchantRefunds: DataAnalysisRefundRow[];
  salesmanRefunds: DataAnalysisRefundRow[];
  details: DataAnalysisOrderDetailRow[];
  detailTruncated: boolean;
  /** Notes for sheets that cannot be fully filled yet. */
  limitations: string[];
}

/** Interactive UI preview — panel rows capped for payload size (Excel uses full rankingLimit). */
export interface DataAnalysisSummary {
  window: DataAnalysisWindow;
  date: string;
  endDate: string;
  /** 上周期闭区间（与当前窗口等长）。 */
  previousStart: string;
  previousEnd: string;
  templateReady: boolean;
  overview: DataAnalysisOverview;
  previousOverview: DataAnalysisOverview;
  deltas: DataAnalysisDeltas;
  /** 按日销售趋势（当前窗口内）。 */
  daily: DataAnalysisDailyPoint[];
  /** 渠道销售占比。 */
  channels: DataAnalysisChannelSlice[];
  /** 热门商品 TOP5。 */
  packages: DataAnalysisPackageRankRow[];
  /** 指标明细：今日 / 昨日 / 近7天 / 近30天。 */
  windowSnapshots: DataAnalysisWindowSnapshot[];
  merchantCount: number;
  salesmanCount: number;
  detailCount: number;
  detailTruncated: boolean;
  /**
   * Residual #279: interactive UI panel caps (Excel export uses full rankingLimit).
   * ranking* — salesmen/merchants Top-N; refund* — refund panels; package* — hot packages.
   */
  rankingLimit?: number;
  rankingTruncated?: boolean;
  refundLimit?: number;
  refundTruncated?: boolean;
  packageLimit?: number;
  packageTruncated?: boolean;
  limitations: string[];
  sheets: Array<{ key: string; title: string; status: 'ready' | 'placeholder' }>;
  /** 时段分布（8 档） */
  timeSlots: DataAnalysisTimeSlotRow[];
  /** 有订单的小时桶 */
  hourly: DataAnalysisHourlyRow[];
  /** 业务员销售额 Top N（UI 默认 20） */
  salesmen: DataAnalysisRankRow[];
  /** 商家销售额 Top N（UI 默认 20） */
  merchants: DataAnalysisRankRow[];
  merchantVerifyLow: DataAnalysisRateRow[];
  merchantVerifyHigh: DataAnalysisRateRow[];
  salesmanVerifyLow: DataAnalysisRateRow[];
  salesmanVerifyHigh: DataAnalysisRateRow[];
  merchantRefunds: DataAnalysisRefundRow[];
  salesmanRefunds: DataAnalysisRefundRow[];
}
