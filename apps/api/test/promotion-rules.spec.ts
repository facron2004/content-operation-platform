import { describe, expect, it } from 'vitest';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import {
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

describe('promotion rules', () => {
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
});
