import type {
  Channel,
  ContentPackage,
  PackageStatus,
  PromotionLevel,
  PromotionScore,
  SalesSnapshot,
  StrategyType
} from '@content/shared';

interface StrategyResult {
  recommendedStrategy: StrategyType;
  reason: string;
  riskTips: string[];
  recommendedChannels: Channel[];
  copyAngles: string[];
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const scoreLevel = (score: number): PromotionLevel => {
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'D';
};

const isBeforeStart = (pkg: ContentPackage, now: Date) => new Date(pkg.startTime).getTime() > now.getTime();

export function calculatePackageStatus(
  pkg: ContentPackage,
  snapshot: SalesSnapshot,
  now = new Date()
): PackageStatus {
  if (pkg.stockLeft <= 0 || snapshot.remainingStock <= 0) return 'sold_out';
  if (snapshot.refundRate > 0.15) return 'high_refund_risk';
  if (isBeforeStart(pkg, now)) return 'pending_launch';

  const stockRatio = pkg.stockTotal === 0 ? 0 : pkg.stockLeft / pkg.stockTotal;
  if (stockRatio < 0.2 && snapshot.paidOrderCount >= 10 && snapshot.salesSpeed >= 5) {
    return 'nearly_sold_out';
  }

  if (snapshot.salesSpeed >= 20 && snapshot.conversionRate >= 0.1) return 'surging';
  if (snapshot.exposureCount < 500) return 'cold_start';
  if (snapshot.exposureCount >= 1500 && snapshot.clickCount / snapshot.exposureCount < 0.05) {
    return 'unclear_selling_point';
  }
  if (snapshot.clickCount >= 100 && snapshot.conversionRate < 0.06) return 'conversion_weak';
  if (snapshot.exposureCount >= 1500 && snapshot.orderCount < 8) return 'poor_sales';
  if (snapshot.verifyRate >= 0.7 && snapshot.refundRate <= 0.05) return 'high_verify';
  if (snapshot.paidOrderCount >= 12 && snapshot.verifyRate < 0.25) return 'low_verify';

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

  if (status === 'nearly_sold_out') score += 4;
  if (status === 'pending_launch') score -= 6;
  if (status === 'sold_out') score -= 30;

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
    saleStart > 0 && snapshotTime > saleStart ? Math.floor((snapshotTime - saleStart) / (24 * 60 * 60 * 1000)) : 0;
  const isBacklog = pkg.stockLeft > 0 && inventoryBacklogDays >= 3;

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
      reason: `当前库存剩余 ${pkg.stockLeft} 份，转化率 ${(snapshot.conversionRate * 100).toFixed(1)}%，适合继续做库存冲刺。`,
      riskTips: ['避免使用全网最低、最后疯抢等绝对化表述'],
      recommendedChannels: level === 'S' ? ['wechat_group', 'moments', 'merchant_share'] : ['wechat_group', 'moments'],
      copyAngles: ['剩余库存', '晚餐场景', '适合结伴']
    };
  }

  if (status === 'high_refund_risk') {
    return {
      recommendedStrategy: 'conversion_optimize',
      reason: `退款率 ${(snapshot.refundRate * 100).toFixed(1)}%，建议暂停强推广并由运营检查套餐规则和履约情况。`,
      riskTips: ['高退款套餐不得自动生成强推广文案', '建议人工确认商家履约'],
      recommendedChannels: [],
      copyAngles: ['规则解释', '到店限制说明']
    };
  }

  if (status === 'conversion_weak' || status === 'unclear_selling_point' || status === 'poor_sales') {
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
      reason: `支付后核销率仅 ${(snapshot.verifyRate * 100).toFixed(1)}%，适合生成到店提醒和预约说明。`,
      riskTips: ['提醒预约方式，不承诺核销收益'],
      recommendedChannels: ['wechat_group'],
      copyAngles: ['到店提醒', '预约方式', '使用时段']
    };
  }

  return {
    recommendedStrategy: pkg.packageType === 'commission' ? 'merchant_co_promotion' : 'launch',
    reason: `当前剩余 ${pkg.stockLeft} / ${pkg.stockTotal}，库存仍有承接空间，建议常规曝光并持续监控售罄进度。`,
    riskTips: ['价格、库存和限制条件必须来自套餐字段'],
    recommendedChannels: level === 'S' ? ['wechat_group', 'moments', 'merchant_share'] : ['wechat_group', 'moments'],
    copyAngles: pkg.packageType === 'commission' ? ['商家推荐', '稳定转化', '场景种草'] : ['区域福利', '开抢提醒', '价格利益点']
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
    calculatedAt: now.toISOString()
  };
}
