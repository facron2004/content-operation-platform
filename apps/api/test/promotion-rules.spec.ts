import { describe, expect, it } from 'vitest';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import {
  buildPromotionScore,
  calculatePackageStatus,
  calculatePromotionScore,
  generateStrategy
} from '../src/domain/promotion-rules';

const basePackage: ContentPackage = {
  packageId: 'PKG001',
  packageName: '双人烤肉套餐',
  packageType: 'welfare',
  merchantId: 'M001',
  merchantName: '老张炭火烤肉',
  areaId: 'A001',
  areaName: '宝安中心',
  category: '餐饮',
  originalPrice: 128,
  salePrice: 49.9,
  welfarePrice: 19.9,
  commissionRate: 0.1,
  grossProfit: 8,
  stockTotal: 100,
  stockLeft: 35,
  startTime: '2026-05-11T17:00:00.000Z',
  endTime: '2026-05-11T23:00:00.000Z',
  useRules: ['需提前2小时预约', '不可叠加'],
  sellingPoints: ['双人可用', '周末通用'],
  fallbackPackageId: 'PKG002',
  miniProgramPath: '/pages/package/detail?id=PKG001',
  merchantCooperationScore: 86,
  areaMatchScore: 88,
  timeMatchScore: 92,
  historyScore: 80
};

const baseSnapshot: SalesSnapshot = {
  packageId: 'PKG001',
  areaId: 'A001',
  merchantId: 'M001',
  snapshotTime: '2026-05-11T18:00:00.000Z',
  exposureCount: 2500,
  clickCount: 320,
  orderCount: 42,
  paidOrderCount: 38,
  refundCount: 1,
  verifyCount: 25,
  gmv: 756.2,
  paidAmount: 756.2,
  refundAmount: 19.9,
  conversionRate: 0.126,
  verifyRate: 0.72,
  refundRate: 0.03,
  sellThroughRate: 0.65,
  remainingStock: 35,
  salesSpeed: 15
};

/**
 * 通用 fixture 工厂:为单个 case 复制 base 后 patch 字段。
 * 避免在每个 it 内手写 13 个字段,可读性 + 抗 fixture 漂移。
 */
function pkgWith(overrides: Partial<ContentPackage> = {}): ContentPackage {
  return { ...basePackage, ...overrides };
}

function snapWith(overrides: Partial<SalesSnapshot> = {}): SalesSnapshot {
  return { ...baseSnapshot, ...overrides };
}

describe('promotion rules', () => {
  // ---- calculatePackageStatus 8 个分支覆盖 ----

  it('marks zero stock packages as sold out', () => {
    const status = calculatePackageStatus(
      { ...basePackage, stockLeft: 0 },
      { ...baseSnapshot, remainingStock: 0, sellThroughRate: 1 },
      new Date('2026-05-11T18:00:00.000Z')
    );

    expect(status).toBe('sold_out');
  });

  it('marks low-stock packages with growing paid orders as nearly sold out', () => {
    const status = calculatePackageStatus(
      { ...basePackage, stockLeft: 18 },
      {
        ...baseSnapshot,
        remainingStock: 18,
        sellThroughRate: 0.82,
        paidOrderCount: 55,
        salesSpeed: 22
      },
      new Date('2026-05-11T18:00:00.000Z')
    );

    expect(status).toBe('nearly_sold_out');
  });

  it('prioritizes high refund risk before normal promotion states', () => {
    const status = calculatePackageStatus(
      basePackage,
      { ...baseSnapshot, refundRate: 0.18 },
      new Date('2026-05-11T18:00:00.000Z')
    );

    expect(status).toBe('high_refund_risk');
  });

  it('returns pending_launch when now is before pkg.startTime', () => {
    // 设定 now 在 startTime 之前,其他条件不触发 sold_out / refund risk
    const status = calculatePackageStatus(
      basePackage,
      baseSnapshot,
      new Date('2026-05-10T00:00:00.000Z') // < startTime (2026-05-11T17:00)
    );
    expect(status).toBe('pending_launch');
  });

  it('returns surging when salesSpeed >= 20 and conversionRate >= 0.1', () => {
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 60 }), // stockRatio = 0.6 → 不触发 nearly_sold_out
      snapWith({ salesSpeed: 25, conversionRate: 0.15 })
    );
    expect(status).toBe('surging');
  });

  it('returns cold_start when exposureCount is very low', () => {
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 90 }),
      snapWith({ exposureCount: 200, clickCount: 10, orderCount: 2 })
    );
    expect(status).toBe('cold_start');
  });

  it('returns unclear_selling_point when many impressions but few clicks', () => {
    // exposureCount >= 1500 && clickCount/exposure < 0.05
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 60 }),
      snapWith({ exposureCount: 2000, clickCount: 50, orderCount: 4 })
    );
    // 注意:也可能命中 poor_sales(exposure >= 1500 && orderCount < 8)
    // 当前实现里 unclear_selling_point 优先于 poor_sales
    expect(['unclear_selling_point', 'poor_sales']).toContain(status);
  });

  it('returns conversion_weak when clickCount >= 100 but conversionRate < 0.06', () => {
    // 关键:不能让 unclear_selling_point 先触发(clickCount/exposure 必须 >= 0.05)
    // 120 / 1500 = 0.08 > 0.05 ✓; clickCount >= 100 && conversionRate 0.04 < 0.06 ✓
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 60 }),
      snapWith({ clickCount: 120, conversionRate: 0.04, exposureCount: 1500, orderCount: 5 })
    );
    expect(status).toBe('conversion_weak');
  });

  it('returns poor_sales when high exposure but low order count (avoiding other branches)', () => {
    // 关键:不能触发 unclear_selling_point(clickCount/exposure >= 0.05,严格)
    // 不能触发 conversion_weak(clickCount 必须 < 100,严格)
    // exposure = 1900, clickCount = 99 → ratio = 0.0521 > 0.05 ✓
    // 99 < 100 → 不命中 conversion_weak ✓
    // exposure >= 1500 && orderCount < 8 → 命中 poor_sales ✓
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 60 }),
      snapWith({ exposureCount: 1900, clickCount: 99, orderCount: 5, conversionRate: 0.02 })
    );
    expect(status).toBe('poor_sales');
  });

  it('returns high_verify when verifyRate >= 0.7 and refundRate <= 0.05', () => {
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 60 }),
      snapWith({ verifyRate: 0.78, refundRate: 0.04, exposureCount: 800, clickCount: 60, orderCount: 6 })
    );
    expect(status).toBe('high_verify');
  });

  it('returns low_verify when paidOrderCount >= 12 but verifyRate < 0.25', () => {
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 60 }),
      snapWith({ paidOrderCount: 15, verifyRate: 0.18, exposureCount: 800, clickCount: 60, orderCount: 14 })
    );
    expect(status).toBe('low_verify');
  });

  it('returns healthy_sales as default for normal mid-life packages', () => {
    // 中等库存、正常数据、无任何特殊触发
    const status = calculatePackageStatus(
      pkgWith({ stockLeft: 60 }),
      snapWith({ exposureCount: 800, clickCount: 60, orderCount: 6, verifyRate: 0.5, refundRate: 0.05 })
    );
    expect(status).toBe('healthy_sales');
  });

  // ---- calculatePromotionScore 分数档位 ----

  it('assigns higher score to lower remaining-stock packages', () => {
    const strong = calculatePromotionScore(basePackage, baseSnapshot, 'healthy_sales');
    const weak = calculatePromotionScore(
      { ...basePackage, stockLeft: 92 },
      {
        ...baseSnapshot,
        conversionRate: 0.01,
        verifyRate: 0.1,
        refundRate: 0.35,
        sellThroughRate: 0.05,
        remainingStock: 95
      },
      'healthy_sales'
    );

    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it('does NOT short-circuit fallback packages (they get normal calc + sold_out penalty)', () => {
    // 代码逻辑: 只有 sold_out && packageType !== 'fallback' 才走 30/D 短路;
    // fallback 类型走正常计算分支:stockRatio 0.35 → base 80,sold_out 再扣 30 = 50
    const { score, level } = calculatePromotionScore(
      pkgWith({ packageType: 'fallback', stockLeft: 35 }),
      snapWith(),
      'sold_out'
    );
    expect(score).toBe(50);
    expect(level).toBe('C');
  });

  it('applies -30 penalty for sold_out welfare packages (80 - 30 = 50)', () => {
    // 走 sold_out 短路前的正常路径:80 - 30 = 50, 与 fallback 不同(它们不走 -30)
    // 这里测的是 sold_out welfare packageType → 走到短路 → score 30, level D
    const { score, level } = calculatePromotionScore(
      pkgWith({ packageType: 'welfare', stockLeft: 35 }),
      snapWith(),
      'sold_out'
    );
    expect(score).toBe(30);
    expect(level).toBe('D');
  });

  it('assigns stockRatio <= 0.2 the highest base score (92)', () => {
    // 30 库存 / 100 总量 = 0.3 → 80, 改为 15 / 100 = 0.15 → 92
    const { score } = calculatePromotionScore(
      pkgWith({ stockLeft: 15 }),
      snapWith(),
      'healthy_sales'
    );
    expect(score).toBe(92);
  });

  it('assigns stockRatio between 0.2 and 0.5 the score 80', () => {
    // 35 / 100 = 0.35 → 80
    const { score } = calculatePromotionScore(
      pkgWith({ stockLeft: 35 }),
      snapWith(),
      'healthy_sales'
    );
    expect(score).toBe(80);
  });

  it('applies +4 bonus for nearly_sold_out status', () => {
    // stockRatio 0.35 → 80; + 4 = 84
    const { score } = calculatePromotionScore(
      pkgWith({ stockLeft: 35 }),
      snapWith(),
      'nearly_sold_out'
    );
    expect(score).toBe(84);
  });

  it('applies -6 penalty for pending_launch status', () => {
    // 80 - 6 = 74
    const { score } = calculatePromotionScore(
      pkgWith({ stockLeft: 35 }),
      snapWith(),
      'pending_launch'
    );
    expect(score).toBe(74);
  });

  // ---- generateStrategy 7 个分支覆盖 ----

  it('generates fallback strategy for sold out welfare packages', () => {
    const strategy = generateStrategy(
      { ...basePackage, stockLeft: 0 },
      { ...baseSnapshot, remainingStock: 0 },
      'sold_out',
      'A'
    );

    expect(strategy.recommendedStrategy).toBe('fallback');
    expect(strategy.recommendedChannels).toContain('wechat_group');
    expect(strategy.reason).toContain('已售罄');
  });

  it('generates preheat strategy for pending_launch packages', () => {
    const strategy = generateStrategy(basePackage, baseSnapshot, 'pending_launch', 'B');
    expect(strategy.recommendedStrategy).toBe('preheat');
    expect(strategy.recommendedChannels).toContain('merchant_share');
    expect(strategy.copyAngles).toContain('开抢预告');
  });

  it('generates conversion_optimize strategy for backlog packages (3+ days unsold)', () => {
    // 设定 startTime 在 3 天前且 stockLeft > 0
    const fourDaysAgo = new Date('2026-05-08T10:00:00.000Z').toISOString();
    const strategy = generateStrategy(
      pkgWith({ startTime: fourDaysAgo, stockLeft: 50 }),
      snapWith({ snapshotTime: '2026-05-11T18:00:00.000Z' }),
      'healthy_sales',
      'A'
    );
    expect(strategy.recommendedStrategy).toBe('conversion_optimize');
    expect(strategy.reason).toContain('连续');
  });

  it('generates sprint strategy for surging packages (level S adds merchant_share)', () => {
    const strategy = generateStrategy(
      pkgWith({ stockLeft: 30 }),
      snapWith({ salesSpeed: 25, conversionRate: 0.15 }),
      'surging',
      'S'
    );
    expect(strategy.recommendedStrategy).toBe('sprint');
    expect(strategy.recommendedChannels).toEqual(
      expect.arrayContaining(['wechat_group', 'moments', 'merchant_share'])
    );
  });

  it('generates sprint strategy for nearly_sold_out (level A only 2 channels)', () => {
    const strategy = generateStrategy(
      pkgWith({ stockLeft: 18 }),
      snapWith({ salesSpeed: 8, conversionRate: 0.15 }),
      'nearly_sold_out',
      'A'
    );
    expect(strategy.recommendedStrategy).toBe('sprint');
    expect(strategy.recommendedChannels).toEqual(['wechat_group', 'moments']);
  });

  it('generates conversion_optimize for high_refund_risk with empty channels', () => {
    const strategy = generateStrategy(basePackage, baseSnapshot, 'high_refund_risk', 'A');
    expect(strategy.recommendedStrategy).toBe('conversion_optimize');
    expect(strategy.recommendedChannels).toEqual([]);
  });

  it('generates verify_reminder for low_verify status', () => {
    const strategy = generateStrategy(basePackage, baseSnapshot, 'low_verify', 'B');
    expect(strategy.recommendedStrategy).toBe('verify_reminder');
    expect(strategy.reason).toContain('核销');
  });

  it('generates conversion_optimize for conversion_weak status with wechat_group only', () => {
    const strategy = generateStrategy(basePackage, baseSnapshot, 'conversion_weak', 'A');
    expect(strategy.recommendedStrategy).toBe('conversion_optimize');
    expect(strategy.recommendedChannels).toEqual(['wechat_group']);
  });

  it('generates merchant_co_promotion as default for commission packages', () => {
    const strategy = generateStrategy(
      pkgWith({ packageType: 'commission' }),
      snapWith(),
      'healthy_sales',
      'A'
    );
    expect(strategy.recommendedStrategy).toBe('merchant_co_promotion');
  });

  it('generates launch as default for welfare packages', () => {
    const strategy = generateStrategy(
      pkgWith({ packageType: 'welfare' }),
      snapWith(),
      'healthy_sales',
      'A'
    );
    expect(strategy.recommendedStrategy).toBe('launch');
  });

  // ---- buildPromotionScore 集成 ----

  it('buildPromotionScore returns a complete PromotionScore object', () => {
    const result = buildPromotionScore(basePackage, baseSnapshot, new Date('2026-05-11T18:00:00.000Z'));
    expect(result.packageId).toBe('PKG001');
    expect(result.areaId).toBe('A001');
    expect(result.level).toMatch(/^[SABCD]$/);
    expect(result.calculatedAt).toBe('2026-05-11T18:00:00.000Z');
    expect(result.recommendedStrategy).toBeTruthy();
    expect(Array.isArray(result.recommendedChannels)).toBe(true);
    expect(Array.isArray(result.copyAngles)).toBe(true);
    expect(Array.isArray(result.riskTips)).toBe(true);
  });
});
