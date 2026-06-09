import { describe, expect, it } from 'vitest';
import type { RecommendPackageItem, SalesSnapshot } from '@content/shared';
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

describe('operation rules', () => {
  it('builds score, tags, alerts and battle card from package facts', () => {
    const score = buildPackageScore(pkg, snapshot);
    const tags = buildOperationTags(pkg, score, snapshot, new Date('2026-05-29T10:00:00.000Z'));
    const alerts = buildOperationAlerts(pkg, score, snapshot, new Date('2026-05-29T10:00:00.000Z'));
    const card = toOperationCard(pkg, score, tags);
    const battleCard = buildBattleCard(pkg, score, tags);

    expect(score.totalScore).toBeGreaterThan(70);
    expect(tags.map((tag) => tag.key)).toEqual(expect.arrayContaining(['hot_restock_needed', 'price_advantage', 'fallback_package']));
    expect(alerts.map((alert) => alert.type)).toContain('abnormal_sold_out');
    expect(card.nextAction).toContain('补货');
    expect(battleCard.communityCopy).toContain('当前售价');
    expect(battleCard.soldOutFallbackCopy).toContain('PKG-FALLBACK');
  });
});
