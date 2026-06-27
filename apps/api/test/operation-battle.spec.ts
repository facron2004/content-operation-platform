import { describe, expect, it } from 'vitest';
import type {
  Channel,
  InventoryTrendPoint,
  OperationCard,
  OperationTag,
  RecommendPackageItem
} from '@content/shared';
import {
  buildCommunityTasks,
  buildDailyReview,
  buildDerivedCommunities
} from '../src/domain/operation-battle';

// ---- fixtures ----

/**
 * 构造完整 RecommendPackageItem(包含 ContentPackage 全部 + 派生字段)。
 * 然后 patch 部分字段。
 * 关键:不直接用 Partial<RecommendPackageItem>(会丢 required 字段),
 * 而是基于一份完整默认 fixture spread 后 override。
 */
function makePkg(overrides: Partial<RecommendPackageItem> = {}): RecommendPackageItem {
  const base: RecommendPackageItem = {
    // ContentPackage 字段
    packageId: 'PKG',
    packageName: '套餐名',
    packageType: 'welfare',
    merchantId: 'M001',
    merchantName: '门店A',
    areaId: 'A001',
    areaName: '宝安中心',
    category: '餐饮',
    originalPrice: 100,
    salePrice: 50,
    welfarePrice: null,
    temporarySalePrice: null,
    commissionRate: 0.1,
    grossProfit: 5,
    stockTotal: 100,
    stockLeft: 50,
    startTime: '2026-05-20T00:00:00.000Z',
    endTime: '2026-06-20T00:00:00.000Z',
    useRules: [],
    sellingPoints: [],
    fallbackPackageId: null,
    miniProgramPath: '/x',
    merchantCooperationScore: 80,
    areaMatchScore: 80,
    timeMatchScore: 80,
    historyScore: 80,
    // RecommendPackageItem 派生字段(给默认值,测试需要时 override)
    status: 'healthy_sales',
    promotionLevel: 'A',
    promotionScore: 80,
    inventoryBacklogDays: 0,
    inventoryPriority: 'normal',
    inventoryFlag: 'normal',
    inventoryFlagLabel: '正常',
    inventoryFlagLevel: 'none',
    inventorySalesFlag: 'observing',
    inventorySalesLabel: '观察中',
    inventorySalesLevel: 'info',
    inventoryObservedDays: 0,
    inventorySoldOutDays: 0,
    inventoryUnsoldDays: 0,
    inventoryTrend: [] as InventoryTrendPoint[],
    recommendedStrategy: 'launch',
    reason: '',
    riskTips: [],
    recommendedChannels: ['wechat_group'] as Channel[],
    conversionRate: 0.1,
    verifyRate: 0.7,
    refundRate: 0.03
  };
  // 直接 spread 即可:`Partial<RecommendPackageItem>` 字段都是 Optional,
  // spread 时即使传入 undefined,也不会覆盖 base 中的完整值
  // (实际测试都传具体值,不会触发 undefined 覆盖)
  return { ...base, ...overrides };
}

function makeCard(overrides: Partial<OperationCard> = {}): OperationCard {
  return {
    packageId: 'PKG',
    packageName: '套餐名',
    merchantName: '门店A',
    areaName: '宝安中心',
    category: '餐饮',
    stockLeft: 50,
    currentPrice: 50,
    score: 80,
    level: 'A',
    tags: [],
    reason: 'test',
    nextAction: 'test',
    recommendedChannels: ['wechat_group'],
    ...overrides
  };
}

const tag = (key: OperationTag['key'], level: OperationTag['level'] = 'info'): OperationTag => ({
  key,
  label: key,
  level,
  reason: `tag-${key}`
});

// ---- buildDerivedCommunities ----

describe('buildDerivedCommunities', () => {
  it('returns empty array for empty input', () => {
    expect(buildDerivedCommunities([], new Map())).toEqual([]);
  });

  it('groups packages with same area+category into a single group', () => {
    const pkg1 = makePkg({ packageId: 'P1' });
    const pkg2 = makePkg({ packageId: 'P2' });
    const cards = new Map([
      ['P1', makeCard({ packageId: 'P1', score: 80 })],
      ['P2', makeCard({ packageId: 'P2', score: 70 })]
    ]);
    const groups = buildDerivedCommunities([pkg1, pkg2], cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupType).toBe('foodie');
    expect(groups[0].todayRecommendedPackages).toHaveLength(2);
    // topCards 按 score 降序
    expect(groups[0].todayRecommendedPackages[0].packageId).toBe('P1');
  });

  it('splits packages with same areaId but different category into 2 groups', () => {
    const pkg1 = makePkg({ packageId: 'P1', category: '餐饮' });
    const pkg2 = makePkg({ packageId: 'P2', category: '丽人' });
    const groups = buildDerivedCommunities([pkg1, pkg2], new Map());
    expect(groups).toHaveLength(2);
  });

  it('sorts groups by activityScore descending', () => {
    const pkg1 = makePkg({ packageId: 'P1', conversionRate: 0.2 });
    const pkg2 = makePkg({ packageId: 'P2', areaId: 'A002', conversionRate: 0.05, areaName: '南山' });
    const groups = buildDerivedCommunities([pkg1, pkg2], new Map());
    expect(groups.length).toBe(2);
    expect(groups[0].activityScore).toBeGreaterThan(groups[1].activityScore);
  });

  it('caps total groups at 12 (slice(0, 12))', () => {
    // 构造 15 个不同的 area+category 组合
    const packages = Array.from({ length: 15 }, (_, i) =>
      makePkg({ packageId: `P${i}`, areaId: `A${i}`, areaName: `区域${i}`, category: `品类${i}` })
    );
    const groups = buildDerivedCommunities(packages, new Map());
    expect(groups).toHaveLength(12);
  });

  it('skips packageIds that have no matching card in the cards map', () => {
    const pkg1 = makePkg({ packageId: 'P1' });
    const pkg2 = makePkg({ packageId: 'P2' });
    // 只给 P1 一张 card,P2 没有 → topCards 应只含 P1
    const cards = new Map([['P1', makeCard({ packageId: 'P1' })]]);
    const groups = buildDerivedCommunities([pkg1, pkg2], cards);
    expect(groups[0].todayRecommendedPackages).toHaveLength(1);
    expect(groups[0].todayRecommendedPackages[0].packageId).toBe('P1');
  });

  it('limits todayRecommendedPackages to top 3 by card score', () => {
    // 4 个 package 共一个 group,各 score 不同
    const pkgs = [
      makePkg({ packageId: 'P1' }),
      makePkg({ packageId: 'P2' }),
      makePkg({ packageId: 'P3' }),
      makePkg({ packageId: 'P4' })
    ];
    const cards = new Map([
      ['P1', makeCard({ packageId: 'P1', score: 90 })],
      ['P2', makeCard({ packageId: 'P2', score: 80 })],
      ['P3', makeCard({ packageId: 'P3', score: 70 })],
      ['P4', makeCard({ packageId: 'P4', score: 60 })]
    ]);
    const groups = buildDerivedCommunities(pkgs, cards);
    expect(groups[0].todayRecommendedPackages).toHaveLength(3);
    expect(groups[0].todayRecommendedPackages.map((c) => c.packageId)).toEqual(['P1', 'P2', 'P3']);
  });

  it('clamps memberCount to [80, 500]', () => {
    // 1 个 package → rows.length = 1 → clamp(120 + 18, 80, 500) = 138
    const pkg = makePkg();
    const groups = buildDerivedCommunities([pkg], new Map());
    expect(groups[0].memberCount).toBe(138);
  });
});

// ---- buildCommunityTasks ----

describe('buildCommunityTasks', () => {
  it('returns empty array for empty communities', () => {
    expect(buildCommunityTasks([])).toEqual([]);
  });

  it('creates one task per community using its first recommended package', () => {
    const community = {
      groupId: 'cg-1',
      groupName: '宝安中心吃喝社群',
      areaId: 'A001',
      areaName: '宝安中心',
      groupType: 'foodie' as const,
      memberCount: 100,
      activityScore: 80,
      historicalConversionRate: 0.1,
      preferredCategories: ['餐饮'],
      todayRecommendedPackages: [
        makeCard({ packageId: 'P1', score: 80 }),
        makeCard({ packageId: 'P2', score: 70 })
      ]
    };
    const tasks = buildCommunityTasks([community]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].packageId).toBe('P1');
    expect(tasks[0].groupId).toBe('cg-1');
  });

  it('alternates plannedTime between 11:30 and 17:40 by index parity', () => {
    const communities = Array.from({ length: 4 }, (_, i) => ({
      groupId: `cg-${i + 1}`,
      groupName: `社群${i + 1}`,
      areaId: 'A001',
      areaName: '宝安',
      groupType: 'foodie' as const,
      memberCount: 100,
      activityScore: 80,
      historicalConversionRate: 0.1,
      preferredCategories: ['餐饮'],
      todayRecommendedPackages: [makeCard({ packageId: `P${i}` })]
    }));
    const tasks = buildCommunityTasks(communities);
    expect(tasks.map((t) => t.plannedTime)).toEqual(['11:30', '17:40', '11:30', '17:40']);
  });
});

// ---- buildDailyReview ----

describe('buildDailyReview', () => {
  it('returns safe defaults when both cards and performances are empty', () => {
    const review = buildDailyReview('2026-05-11', [], []);
    expect(review.date).toBe('2026-05-11');
    expect(review.goodPackages).toEqual([]);
    expect(review.weakPackages).toEqual([]);
    expect(review.highConversionCopies).toEqual([]);
    expect(review.valuableCommunities).toEqual([]);
    expect(review.whatHappened[0]).toContain('0');
    expect(review.tomorrowSuggestions).toBeDefined();
  });

  it('filters goodPackages to score >= 75, capped at 5', () => {
    const cards = [
      makeCard({ packageId: 'A', score: 90 }),
      makeCard({ packageId: 'B', score: 80 }),
      makeCard({ packageId: 'C', score: 75 }),
      makeCard({ packageId: 'D', score: 70 }), // 不到 75,不应入选
      makeCard({ packageId: 'E', score: 95 }),
      makeCard({ packageId: 'F', score: 85 }),
      makeCard({ packageId: 'G', score: 88 })
    ];
    const review = buildDailyReview('2026-05-11', cards, []);
    expect(review.goodPackages).toHaveLength(5);
    expect(review.goodPackages.every((c) => c.score >= 75)).toBe(true);
  });

  it('filters weakPackages to those with continuous_slow or high_refund_risk tag, capped at 5', () => {
    const cards = [
      makeCard({ packageId: 'A', score: 80, tags: [tag('continuous_slow', 'danger')] }),
      makeCard({ packageId: 'B', score: 80, tags: [tag('high_refund_risk', 'danger')] }),
      makeCard({ packageId: 'C', score: 80, tags: [tag('price_advantage', 'success')] }), // 不是 weak
      makeCard({ packageId: 'D', score: 80, tags: [tag('continuous_slow', 'danger')] }),
      makeCard({ packageId: 'E', score: 80, tags: [tag('high_refund_risk', 'danger')] }),
      makeCard({ packageId: 'F', score: 80, tags: [tag('continuous_slow', 'danger')] }),
      makeCard({ packageId: 'G', score: 80, tags: [tag('high_refund_risk', 'danger')] })
    ];
    const review = buildDailyReview('2026-05-11', cards, []);
    expect(review.weakPackages).toHaveLength(5);
    expect(review.weakPackages.every((c) => c.tags.some((t) => t.key === 'continuous_slow' || t.key === 'high_refund_risk'))).toBe(true);
  });

  it('sorts highConversionCopies by conversionRate descending and caps at 5', () => {
    const performances = [
      { contentId: 'C1', title: 'A', channel: 'wechat_group' as Channel, conversionRate: 0.05, orderCount: 10, groupId: 'g1' },
      { contentId: 'C2', title: 'B', channel: 'wechat_group' as Channel, conversionRate: 0.20, orderCount: 10, groupId: 'g1' },
      { contentId: 'C3', title: 'C', channel: 'moments' as Channel, conversionRate: 0.12, orderCount: 10, groupId: null },
      { contentId: 'C4', title: 'D', channel: 'wechat_group' as Channel, conversionRate: 0.18, orderCount: 10, groupId: 'g1' },
      { contentId: 'C5', title: 'E', channel: 'moments' as Channel, conversionRate: 0.08, orderCount: 10, groupId: null },
      { contentId: 'C6', title: 'F', channel: 'wechat_group' as Channel, conversionRate: 0.15, orderCount: 10, groupId: 'g1' }
    ];
    const review = buildDailyReview('2026-05-11', [], performances);
    expect(review.highConversionCopies).toHaveLength(5);
    const rates = review.highConversionCopies.map((c) => c.conversionRate);
    expect(rates).toEqual([0.20, 0.18, 0.15, 0.12, 0.08]);
  });

  it('only includes performances with groupId in valuableCommunities', () => {
    const performances = [
      { contentId: 'C1', title: 'A', channel: 'wechat_group' as Channel, conversionRate: 0.15, orderCount: 10, groupId: 'g1' },
      { contentId: 'C2', title: 'B', channel: 'wechat_group' as Channel, conversionRate: 0.10, orderCount: 10, groupId: null }
    ];
    const review = buildDailyReview('2026-05-11', [], performances);
    expect(review.valuableCommunities).toHaveLength(1);
    expect(review.valuableCommunities[0].groupId).toBe('g1');
  });

  it('marks reason as high-conversion when rate >= 0.12', () => {
    const performances = [
      { contentId: 'C1', title: 'A', channel: 'wechat_group' as Channel, conversionRate: 0.15, orderCount: 10, groupId: 'g1' }
    ];
    const review = buildDailyReview('2026-05-11', [], performances);
    expect(review.valuableCommunities[0].reason).toContain('昨日转化高');
  });

  it('marks reason as testable when rate < 0.12', () => {
    const performances = [
      { contentId: 'C1', title: 'A', channel: 'wechat_group' as Channel, conversionRate: 0.08, orderCount: 10, groupId: 'g1' }
    ];
    const review = buildDailyReview('2026-05-11', [], performances);
    expect(review.valuableCommunities[0].reason).toContain('小流量测试');
  });

  it('omits "highest conversion" line in whatHappened when no performances', () => {
    const review = buildDailyReview('2026-05-11', [], []);
    // whatHappened 应回退到通用文案
    const joined = review.whatHappened.join('\n');
    expect(joined).not.toContain('最高转化文案');
    expect(joined).toContain('暂无足够文案效果数据');
  });

  it('includes highest conversion title in whatHappened when performances present', () => {
    const performances = [
      { contentId: 'C1', title: '爆款标题', channel: 'wechat_group' as Channel, conversionRate: 0.20, orderCount: 10, groupId: 'g1' }
    ];
    const review = buildDailyReview('2026-05-11', [], performances);
    expect(review.whatHappened.join('\n')).toContain('爆款标题');
  });
});
