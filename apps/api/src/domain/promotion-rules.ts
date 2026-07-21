import type {
  Channel,
  ContentPackage,
  PackageStatus,
  PromotionLevel,
  PromotionScore,
  SalesSnapshot,
  StrategyType
} from '@content/shared';
import { formatRatePercent, nowISO } from '@content/shared';
import {
  clamp,
  CLICK_CONVERSION_WEAK_MIN,
  CONVERSION_WEAK_RATE_THRESHOLD,
  CTR_UNCLEAR_SELLING_POINT_MAX,
  EXPOSURE_COLD_START_MAX,
  EXPOSURE_POOR_SALES_MIN,
  EXPOSURE_UNCLEAR_SELLING_POINT_MIN,
  HEALTHY_VERIFY_RATE_THRESHOLD,
  HEALTHY_VERIFY_REFUND_RATE_CAP,
  HIGH_REFUND_RATE_THRESHOLD,
  INVENTORY_BACKLOG_DAYS_THRESHOLD,
  LOW_VERIFY_PAID_ORDER_COUNT_THRESHOLD,
  LOW_VERIFY_RATE_THRESHOLD,
  MS_PER_DAY,
  NEARLY_SOLD_OUT_PAID_ORDER_THRESHOLD,
  POOR_SALES_ORDER_COUNT_THRESHOLD,
  SALES_SPEED_HOT_THRESHOLD,
  scoreLevel,
  SURGING_CONVERSION_RATE_THRESHOLD,
  SURGING_SALES_SPEED_THRESHOLD
} from './utils';

interface StrategyResult {
  recommendedStrategy: StrategyType;
  reason: string;
  riskTips: string[];
  recommendedChannels: Channel[];
  copyAngles: string[];
}

// 弱转化场景的状态合集,统一为单处常量便于运营调整。
const WEAK_CONVERSION_STATUSES = new Set<PackageStatus>([
  'conversion_weak',
  'unclear_selling_point',
  'poor_sales'
]);

// 推广分状态调整量,默认 0;仅覆盖需要加减分的特殊状态。
const STATUS_SCORE_DELTA: Record<PackageStatus, number> = {
  pending_launch: -6,
  nearly_sold_out: 4,
  sold_out: -30,
  healthy_sales: 0,
  surging: 0,
  cold_start: 0,
  conversion_weak: 0,
  poor_sales: 0,
  high_refund_risk: 0,
  high_verify: 0,
  low_verify: 0,
  unclear_selling_point: 0
};

const isBeforeStart = (pkg: ContentPackage, now: Date) =>
  new Date(pkg.startTime).getTime() > now.getTime();

export function calculatePackageStatus(
  pkg: ContentPackage,
  snapshot: SalesSnapshot,
  now = new Date()
): PackageStatus {
  if (pkg.stockLeft <= 0 || snapshot.remainingStock <= 0) return 'sold_out';
  if (snapshot.refundRate > HIGH_REFUND_RATE_THRESHOLD) return 'high_refund_risk';
  if (isBeforeStart(pkg, now)) return 'pending_launch';

  const stockRatio = pkg.stockTotal === 0 ? 0 : pkg.stockLeft / pkg.stockTotal;
  if (
    stockRatio < 0.2 &&
    snapshot.paidOrderCount >= NEARLY_SOLD_OUT_PAID_ORDER_THRESHOLD &&
    snapshot.salesSpeed >= SALES_SPEED_HOT_THRESHOLD
  ) {
    return 'nearly_sold_out';
  }

  if (
    snapshot.salesSpeed >= SURGING_SALES_SPEED_THRESHOLD &&
    snapshot.conversionRate >= SURGING_CONVERSION_RATE_THRESHOLD
  )
    return 'surging';
  if (snapshot.exposureCount < EXPOSURE_COLD_START_MAX) return 'cold_start';
  if (
    snapshot.exposureCount >= EXPOSURE_UNCLEAR_SELLING_POINT_MIN &&
    snapshot.clickCount / snapshot.exposureCount < CTR_UNCLEAR_SELLING_POINT_MAX
  ) {
    return 'unclear_selling_point';
  }
  if (
    snapshot.clickCount >= CLICK_CONVERSION_WEAK_MIN &&
    snapshot.conversionRate < CONVERSION_WEAK_RATE_THRESHOLD
  )
    return 'conversion_weak';
  if (
    snapshot.exposureCount >= EXPOSURE_POOR_SALES_MIN &&
    snapshot.orderCount < POOR_SALES_ORDER_COUNT_THRESHOLD
  )
    return 'poor_sales';
  if (
    snapshot.verifyRate >= HEALTHY_VERIFY_RATE_THRESHOLD &&
    snapshot.refundRate <= HEALTHY_VERIFY_REFUND_RATE_CAP
  )
    return 'high_verify';
  if (
    snapshot.paidOrderCount >= LOW_VERIFY_PAID_ORDER_COUNT_THRESHOLD &&
    snapshot.verifyRate < LOW_VERIFY_RATE_THRESHOLD
  )
    return 'low_verify';

  return 'healthy_sales';
}

export function calculatePromotionScore(
  pkg: ContentPackage,
  _snapshot: SalesSnapshot,
  status: PackageStatus
): { score: number; level: PromotionLevel } {
  if (status === 'sold_out' && pkg.packageType !== 'fallback') {
    return { score: 30, level: 'D' };
  }

  const stockRatio = pkg.stockTotal === 0 ? 0 : pkg.stockLeft / pkg.stockTotal;
  let score = 60;
  if (stockRatio <= 0.2) score = 92;
  else if (stockRatio <= 0.5) score = 80;
  else if (stockRatio <= 0.8) score = 68;
  else score = 50;

  score += STATUS_SCORE_DELTA[status];

  const finalScore = Math.round(clamp(score));
  return { score: finalScore, level: scoreLevel(finalScore) };
}

export function generateStrategy(
  pkg: ContentPackage,
  snapshot: SalesSnapshot,
  status: PackageStatus,
  level: PromotionLevel
): StrategyResult {
  const saleStart = new Date(pkg.startTime).getTime();
  const snapshotTime = new Date(snapshot.snapshotTime).getTime();
  const inventoryBacklogDays =
    saleStart > 0 && snapshotTime > saleStart
      ? Math.floor((snapshotTime - saleStart) / MS_PER_DAY)
      : 0;
  const isBacklog = pkg.stockLeft > 0 && inventoryBacklogDays >= INVENTORY_BACKLOG_DAYS_THRESHOLD;

  if (status === 'sold_out' && pkg.fallbackPackageId) {
    return {
      recommendedStrategy: 'fallback',
      reason: `${pkg.packageName} 已售罄，建议承接到同商家替代套餐，避免福利餐流量流失。`,
      riskTips: ['售罄套餐不得继续宣传可抢', '承接文案避免夸张价格对比'],
      recommendedChannels: ['wechat_group', 'moments'],
      copyAngles: ['没抢到看这个', '同店承接', '仍可到店使用']
    };
  }

  if (status === 'pending_launch') {
    return {
      recommendedStrategy: 'preheat',
      reason: `${pkg.packageName} 尚未开抢，适合提前告知开抢时间、库存和使用规则。`,
      riskTips: ['预告文案必须保留开抢时间'],
      recommendedChannels: ['wechat_group', 'merchant_share'],
      copyAngles: ['开抢预告', '区域福利', '限量库存']
    };
  }

  if (isBacklog) {
    return {
      recommendedStrategy: 'conversion_optimize',
      reason: `${pkg.packageName} 已连续 ${inventoryBacklogDays} 天未售罄，当前剩余 ${pkg.stockLeft} 份，建议前排展示并突出库存与到店规则。`,
      riskTips: ['库存滞销套餐需优先前排曝光', '文案必须写明库存和当前售价（如有）'],
      recommendedChannels: ['wechat_group', 'moments'],
      copyAngles: ['库存前排', '当前售价核对', '使用限制说明']
    };
  }

  if (status === 'nearly_sold_out' || status === 'surging') {
    return {
      recommendedStrategy: 'sprint',
      reason: `当前库存剩余 ${pkg.stockLeft} 份，转化率 ${formatRatePercent(snapshot.conversionRate)}，适合继续做库存冲刺。`,
      riskTips: ['避免使用全网最低、最后疯抢等绝对化表述'],
      recommendedChannels:
        level === 'S' ? ['wechat_group', 'moments', 'merchant_share'] : ['wechat_group', 'moments'],
      copyAngles: ['剩余库存', '晚餐场景', '适合结伴']
    };
  }

  if (status === 'high_refund_risk') {
    return {
      recommendedStrategy: 'conversion_optimize',
      reason: `退款率 ${formatRatePercent(snapshot.refundRate)}，建议暂停强推广并由运营检查套餐规则和履约情况。`,
      riskTips: ['高退款套餐不得自动生成强推广文案', '建议人工确认商家履约'],
      recommendedChannels: [],
      copyAngles: ['规则解释', '到店限制说明']
    };
  }

  if (WEAK_CONVERSION_STATUSES.has(status)) {
    return {
      recommendedStrategy: 'conversion_optimize',
      reason: `曝光或点击已有基础，但下单表现偏弱，建议换卖点、补充使用规则和消费场景。`,
      riskTips: ['避免继续使用强抢购话术'],
      recommendedChannels: ['wechat_group'],
      copyAngles: ['场景种草', '套餐内容', '使用规则']
    };
  }

  if (status === 'low_verify') {
    return {
      recommendedStrategy: 'verify_reminder',
      reason: `支付后核销率仅 ${formatRatePercent(snapshot.verifyRate)}，适合生成到店提醒和预约说明。`,
      riskTips: ['提醒预约方式，不承诺核销收益'],
      recommendedChannels: ['wechat_group'],
      copyAngles: ['到店提醒', '预约方式', '使用时段']
    };
  }

  return {
    recommendedStrategy: pkg.packageType === 'commission' ? 'merchant_co_promotion' : 'launch',
    reason: `当前剩余 ${pkg.stockLeft} / ${pkg.stockTotal}，库存仍有承接空间，建议常规曝光并持续监控售罄进度。`,
    riskTips: ['价格、库存和限制条件必须来自套餐字段'],
    recommendedChannels:
      level === 'S' ? ['wechat_group', 'moments', 'merchant_share'] : ['wechat_group', 'moments'],
    copyAngles:
      pkg.packageType === 'commission'
        ? ['商家推荐', '稳定转化', '场景种草']
        : ['区域福利', '开抢提醒', '价格利益点']
  };
}

export function buildPromotionScore(
  pkg: ContentPackage,
  snapshot: SalesSnapshot,
  now = new Date()
): PromotionScore {
  const status = calculatePackageStatus(pkg, snapshot, now);
  const { score, level } = calculatePromotionScore(pkg, snapshot, status);
  const strategy = generateStrategy(pkg, snapshot, status, level);

  return {
    packageId: pkg.packageId,
    areaId: pkg.areaId,
    score,
    level,
    status,
    recommendedStrategy: strategy.recommendedStrategy,
    reason: strategy.reason,
    riskTips: strategy.riskTips,
    recommendedChannels: strategy.recommendedChannels,
    copyAngles: strategy.copyAngles,
    calculatedAt: nowISO(now)
  };
}
