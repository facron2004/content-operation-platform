import { describe, expect, it } from 'vitest';
import type {
  OperationTag,
  PackageScoreBreakdown,
  RecommendPackageItem,
  SalesSnapshot
} from '@content/shared';
import {
  buildBattleCard,
  buildOperationAlerts,
  buildOperationTags,
  buildPackageScore,
  toOperationCard
} from '../src/domain/operation-rules';

const pkg: RecommendPackageItem = {
  packageId: 'PKG-OPS',
  packageName: '宝安双人烤肉套餐',
  packageType: 'welfare',
  merchantId: 'M001',
  merchantName: '老张炭火烤肉',
  areaId: 'A001',
  areaName: '宝安中心',
  category: '餐饮',
  originalPrice: 199,
  salePrice: 79,
  welfarePrice: 69,
  temporarySalePrice: 69,
  commissionRate: 0.18,
  grossProfit: 18,
  stockTotal: 100,
  stockLeft: 0,
  startTime: '2026-05-20T00:00:00.000Z',
  endTime: '2026-06-20T00:00:00.000Z',
  useRules: ['需提前2小时预约'],
  sellingPoints: ['双人可用', '含牛五花'],
  fallbackPackageId: 'PKG-FALLBACK',
  miniProgramPath: '/pages/package/detail?id=PKG-OPS',
  saleStatus: 'selling',
  merchantCooperationScore: 90,
  areaMatchScore: 88,
  timeMatchScore: 86,
  historyScore: 80,
  status: 'sold_out',
  promotionLevel: 'A',
  promotionScore: 80,
  inventoryBacklogDays: 0,
  inventoryPriority: 'normal',
  inventoryFlag: 'normal',
  inventoryFlagLabel: '正常',
  inventoryFlagLevel: 'none',
  inventorySalesFlag: 'hot_sold_out_recent',
  inventorySalesLabel: '连续售罄·热销',
  inventorySalesLevel: 'success',
  inventoryObservedDays: 3,
  inventorySoldOutDays: 3,
  inventoryUnsoldDays: 0,
  inventoryTrend: [],
  recommendedStrategy: 'sprint',
  reason: '近期售罄表现强',
  riskTips: [],
  recommendedChannels: ['wechat_group', 'moments'],
  conversionRate: 0.18,
  verifyRate: 0.82,
  refundRate: 0.02
};

const snapshot: SalesSnapshot = {
  packageId: pkg.packageId,
  areaId: pkg.areaId,
  merchantId: pkg.merchantId,
  snapshotTime: '2026-05-29T10:00:00.000Z',
  exposureCount: 2000,
  clickCount: 260,
  orderCount: 100,
  paidOrderCount: 98,
  refundCount: 2,
  verifyCount: 80,
  gmv: 6800,
  paidAmount: 6800,
  refundAmount: 138,
  conversionRate: 0.18,
  verifyRate: 0.82,
  refundRate: 0.02,
  sellThroughRate: 1,
  remainingStock: 0,
  salesSpeed: 8
};

// ---- helpers ----

function pkgWith(overrides: Partial<RecommendPackageItem>): RecommendPackageItem {
  return { ...pkg, ...overrides };
}

function snapWith(overrides: Partial<SalesSnapshot>): SalesSnapshot {
  return { ...snapshot, ...overrides };
}

function tagWith(key: OperationTag['key'], level: OperationTag['level'] = 'info'): OperationTag {
  return { key, label: key, level, reason: `tag-${key}` };
}

/**
 * 计算维度 weighted sum:totalScore = Σ(score × weight)
 * 期望值与 buildPackageScore 一致,作为独立回归测试。
 */
function expectedWeightedSum(breakdown: PackageScoreBreakdown): number {
  return Math.round(
    breakdown.dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  );
}

describe('operation rules', () => {
  it('builds score, tags, alerts and battle card from package facts', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(pkg, score, snapshot, new Date('2026-05-29T10:00:00.000Z'));
    const alerts = buildOperationAlerts(pkg, score, snapshot, new Date('2026-05-29T10:00:00.000Z'));
    const card = toOperationCard(pkg, score, tags);
    const battleCard = buildBattleCard(pkg, score, tags);

    expect(score.totalScore).toBeGreaterThan(70);
    expect(tags.map((tag) => tag.key)).toEqual(
      expect.arrayContaining(['hot_restock_needed', 'price_advantage', 'fallback_package'])
    );
    expect(alerts.map((alert) => alert.type)).toContain('abnormal_sold_out');
    expect(card.nextAction).toContain('补货');
    expect(battleCard.communityCopy).toContain('当前售价');
    expect(battleCard.soldOutFallbackCopy).toContain('PKG-FALLBACK');
  });
});

// ---- buildPackageScore 维度隔离 ----

describe('buildPackageScore', () => {
  it('returns weighted totalScore matching manual sum', () => {
    const score = buildPackageScore(pkg, snapshot);
    expect(score.totalScore).toBe(expectedWeightedSum(score));
  });

  it('price_advantage dimension hits 65 for 50% discount', () => {
    // discount = 0.5 → score = clamp(0.5 * 130) = 65
    const score = buildPackageScore(pkgWith({ originalPrice: 200, temporarySalePrice: 100 }), snapshot);
    const dim = score.dimensions.find((d) => d.key === 'price_advantage');
    expect(dim?.score).toBe(65);
    expect(dim?.weight).toBe(0.18);
  });

  it('inventory_pressure uses neverSoldOutInWindow reason when applicable', () => {
    // inventoryObservedDays >= 2 && inventorySoldOutDays === 0 && stockLeft > 0
    const score = buildPackageScore(
      pkgWith({ stockLeft: 50, inventoryObservedDays: 5, inventorySoldOutDays: 0, stockTotal: 100 }),
      snapshot
    );
    const dim = score.dimensions.find((d) => d.key === 'inventory_pressure');
    expect(dim?.reason).toContain('近 5 天');
  });

  it('verify_rate caps at 100 even with 100% verify', () => {
    const score = buildPackageScore(pkg, snapWith({ verifyRate: 1 }));
    const dim = score.dimensions.find((d) => d.key === 'verify_rate');
    expect(dim?.score).toBe(100);
  });

  it('refund_health score approaches 0 with 20% refund rate', () => {
    // clamp(100 - 0.2 * 520) = clamp(-4) = 0
    const score = buildPackageScore(pkg, snapWith({ refundRate: 0.2 }));
    const dim = score.dimensions.find((d) => d.key === 'refund_health');
    expect(dim?.score).toBe(0);
  });

  it('profit_space reflects commissionRate and grossProfit', () => {
    // commissionSpace = clamp(0.18 * 450 + 18 * 2) = clamp(81 + 36) = 100
    const score = buildPackageScore(pkg, snapshot);
    const dim = score.dimensions.find((d) => d.key === 'profit_space');
    expect(dim?.score).toBe(100);
  });

  it('reasons array contains only dimensions with extreme scores (<=35 or >=75)', () => {
    const score = buildPackageScore(pkg, snapshot);
    for (const reason of score.reasons) {
      // reason 形如 "维度名：reason text"
      const label = reason.split('：')[0];
      const dim = score.dimensions.find((d) => d.label === label);
      expect(dim).toBeDefined();
      expect(dim!.score <= 35 || dim!.score >= 75).toBe(true);
    }
  });
});

// ---- buildOperationTags 隔离 ----

describe('buildOperationTags', () => {
  const now = new Date('2026-05-29T10:00:00.000Z');

  it('adds hot_restock_needed for hot_sold_out_recent inventory flag', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ inventorySalesFlag: 'hot_sold_out_recent' }),
      score,
      snapshot,
      now
    );
    expect(tags.map((t) => t.key)).toContain('hot_restock_needed');
  });

  it('adds hot_restock_needed when stockLeft=0 and salesSpeed>=5', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ stockLeft: 0, inventorySalesFlag: 'observing' }),
      score,
      snapWith({ salesSpeed: 6 }),
      now
    );
    expect(tags.map((t) => t.key)).toContain('hot_restock_needed');
  });

  it('adds continuous_slow for slow_never_sold_out flag', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ inventorySalesFlag: 'slow_never_sold_out', inventoryFlag: 'unsold_3d_slow' }),
      score,
      snapshot,
      now
    );
    expect(tags.map((t) => t.key)).toContain('continuous_slow');
  });

  it('adds high_refund_risk for refundRate >= 0.15', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ status: 'healthy_sales' }),
      score,
      snapWith({ refundRate: 0.18 }),
      now
    );
    expect(tags.map((t) => t.key)).toContain('high_refund_risk');
  });

  it('adds high_verify_quality when verifyRate >= 0.7 AND refundRate <= 0.05', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(pkg, score, snapWith({ verifyRate: 0.75, refundRate: 0.04 }), now);
    expect(tags.map((t) => t.key)).toContain('high_verify_quality');
  });

  it('does NOT add high_verify_quality when refundRate too high', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(pkg, score, snapWith({ verifyRate: 0.75, refundRate: 0.06 }), now);
    expect(tags.map((t) => t.key)).not.toContain('high_verify_quality');
  });

  it('adds ending_clearance when endTime within 48 hours', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ endTime: '2026-05-30T10:00:00.000Z', stockLeft: 5 }),
      score,
      snapshot,
      now
    );
    expect(tags.map((t) => t.key)).toContain('ending_clearance');
  });

  it('does NOT add ending_clearance when endTime > 48 hours', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ endTime: '2026-06-30T10:00:00.000Z', stockLeft: 5 }),
      score,
      snapshot,
      now
    );
    expect(tags.map((t) => t.key)).not.toContain('ending_clearance');
  });

  it('adds price_advantage for discount <= 0.5 with positive price', () => {
    // temporarySalePrice=69, originalPrice=199 → price/original = 0.347 → discount=0.653, ratio=0.347
    // ratio = price/original, so <= 0.5 means price <= 0.5 * original
    // Set temporarySalePrice=80, originalPrice=200 → 80/200 = 0.4 ≤ 0.5 ✓
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ originalPrice: 200, salePrice: 80, temporarySalePrice: 80, welfarePrice: 80 }),
      score,
      snapshot,
      now
    );
    expect(tags.map((t) => t.key)).toContain('price_advantage');
  });

  it('adds fallback_package for packageType=fallback', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({ packageType: 'fallback' }),
      score,
      snapshot,
      now
    );
    expect(tags.map((t) => t.key)).toContain('fallback_package');
  });

  it('does NOT add community_focus when any danger tag is present', () => {
    // 触发 high_refund_risk (danger) → community_focus 的 4 个条件里"无 danger tag"失败
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({
        stockLeft: 10,
        recommendedChannels: ['wechat_group'],
        inventorySalesFlag: 'observing'
      }),
      score,
      snapWith({ refundRate: 0.18 }),
      now
    );
    // 确认 danger tag 已添加(确认前提)
    expect(tags.map((t) => t.key)).toContain('high_refund_risk');
    // 关键断言:danger tag 存在时,community_focus 不应添加
    expect(tags.map((t) => t.key)).not.toContain('community_focus');
  });

  it('adds community_focus when score >= 70, stock > 0, wechat_group, no danger tag', () => {
    // 4 个条件全满足,且 tags 里没有 danger
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(
      pkgWith({
        stockLeft: 10,
        recommendedChannels: ['wechat_group'],
        inventorySalesFlag: 'observing',
        fallbackPackageId: null // 避免 fallback_package
      }),
      score,
      snapWith({ refundRate: 0.02, verifyRate: 0.5 }), // 不触发 high_refund/high_verify
      now
    );
    expect(tags.map((t) => t.key)).toContain('community_focus');
  });
});

// ---- buildOperationAlerts 隔离 ----

describe('buildOperationAlerts', () => {
  const now = new Date('2026-05-29T10:00:00.000Z');

  it('adds continuous_unsold for slow inventory flag', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(
      pkgWith({ inventoryFlag: 'unsold_3d_slow', inventorySalesFlag: 'slow_never_sold_out', inventoryObservedDays: 3, inventorySoldOutDays: 0, stockLeft: 50 }),
      score,
      snapshot,
      now
    );
    expect(alerts.map((a) => a.type)).toContain('continuous_unsold');
  });

  it('adds abnormal_sold_out for hot inventory flag', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(
      pkgWith({ inventorySalesFlag: 'hot_sold_out_recent' }),
      score,
      snapshot,
      now
    );
    expect(alerts.map((a) => a.type)).toContain('abnormal_sold_out');
  });

  it('adds high_refund for refundRate >= 0.15', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(pkg, score, snapWith({ refundRate: 0.2 }), now);
    expect(alerts.map((a) => a.type)).toContain('high_refund');
  });

  it('adds low_verify for paidOrderCount >= 10 AND verifyRate < 0.25', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(pkg, score, snapWith({ paidOrderCount: 15, verifyRate: 0.2 }), now);
    expect(alerts.map((a) => a.type)).toContain('low_verify');
  });

  it('adds missing_use_rules when useRules is empty', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(pkgWith({ useRules: [] }), score, snapshot, now);
    expect(alerts.map((a) => a.type)).toContain('missing_use_rules');
  });

  it('adds missing_selling_points when sellingPoints is empty', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(pkgWith({ sellingPoints: [] }), score, snapshot, now);
    expect(alerts.map((a) => a.type)).toContain('missing_selling_points');
  });

  it('adds inventory_abnormal when stockTotal=0', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(pkgWith({ stockTotal: 0, stockLeft: 10 }), score, snapshot, now);
    expect(alerts.map((a) => a.type)).toContain('inventory_abnormal');
  });

  it('adds inventory_abnormal when stockLeft > stockTotal', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(pkgWith({ stockTotal: 50, stockLeft: 80 }), score, snapshot, now);
    expect(alerts.map((a) => a.type)).toContain('inventory_abnormal');
  });

  it('adds price_abnormal when currentPrice=0', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(
      pkgWith({ salePrice: 0, temporarySalePrice: 0, welfarePrice: 0 }),
      score,
      snapshot,
      now
    );
    expect(alerts.map((a) => a.type)).toContain('price_abnormal');
  });

  it('adds merchant_abnormal when merchantCooperationScore < 60', () => {
    const score = buildPackageScore(pkg, snapshot);
    const alerts = buildOperationAlerts(
      pkgWith({ merchantCooperationScore: 50 }),
      score,
      snapshot,
      now
    );
    expect(alerts.map((a) => a.type)).toContain('merchant_abnormal');
  });
});

// ---- toOperationCard 隔离 ----

describe('toOperationCard', () => {
  it('uses 补货 nextAction when hot_restock_needed tag is present', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = [tagWith('hot_restock_needed', 'success')];
    const card = toOperationCard(pkg, score, tags);
    expect(card.nextAction).toContain('补货');
  });

  it('uses 滞销 nextAction when continuous_slow tag is present', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = [tagWith('continuous_slow', 'danger')];
    const card = toOperationCard(pkg, score, tags);
    expect(card.nextAction).toContain('滞销');
  });

  it('falls back to default nextAction when no special tag', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags: OperationTag[] = [];
    const card = toOperationCard(pkg, score, tags);
    // 落到 nextActionFor 的默认分支
    expect(card.nextAction).toMatch(/观察池|推送/);
  });
});
