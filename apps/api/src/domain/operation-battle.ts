import type {
  BattleCard,
  Channel,
  ContentPackage,
  PackageScoreBreakdown,
  RecommendPackageItem,
  OperationTag,
  CommunityGroup,
  CommunityPushTask,
  DailyOperationReview,
  OperationCard
} from '@content/shared';
import { currentPrice } from '@content/shared';
import {
  clamp,
  DEEP_DISCOUNT_RATIO_THRESHOLD,
  formatPrice,
  HIGH_CONVERSION_RATE_THRESHOLD,
  LOW_STOCK_WARNING_THRESHOLD,
  MAX_DERIVED_COMMUNITY_GROUPS,
  uniqueText
} from './utils';
import { nowISO } from '../common/format';

// 品类分类正则 —— 多处复用,集中在这里便于调整。
// FOODIE/WELLNESS/PARENT_CHILD/FITNESS 用作 audience/time/group 推断的入口。
const FOODIE_CATEGORY_RE = /餐|饮|甜品|烧烤|火锅|中餐|西餐/;
const WELLNESS_CATEGORY_RE = /按摩|水疗|足浴|美容|美发|SPA|汤泉/;
const PARENT_CHILD_CATEGORY_RE = /亲子|儿童/;
const FITNESS_CATEGORY_RE = /健身|运动|练习场/;

export function buildBattleCard(
  pkg: RecommendPackageItem,
  score: PackageScoreBreakdown,
  tags: OperationTag[]
): BattleCard {
  const price = currentPrice(pkg);
  const audience = inferAudience(pkg);
  const channels = pkg.recommendedChannels.length
    ? pkg.recommendedChannels
    : (['wechat_group'] as Channel[]);
  const sellingPoints = buildSellingPoints(pkg, price);
  const priceText = `${formatPrice(price, 2)} 元`;
  const stockText = stockCue(pkg);
  const ruleText = primaryUseRule(pkg);
  const leadPoint = sellingPoints[0] ?? pkg.category;
  const secondPoint = sellingPoints[1] ?? `${pkg.areaName}可用`;
  const riskTips = [
    ...pkg.riskTips,
    ...tags
      .filter((tag) => tag.level === 'danger' || tag.level === 'warning')
      .map((tag) => tag.reason),
    ruleText ? `使用规则：${ruleText}` : ''
  ];

  return {
    packageId: pkg.packageId,
    packageName: pkg.packageName,
    generatedAt: nowISO(),
    recommendationReason: score.reasons[0] ?? tags[0]?.reason ?? pkg.reason,
    targetAudience: audience,
    suitableChannels: channels,
    recommendedPushTime: recommendPushTime(pkg),
    mainSellingPoints: sellingPoints,
    riskTips: uniqueText(riskTips),
    communityCopy: `【${pkg.packageName}】当前售价 ${priceText}，${stockText}\n主推：${leadPoint}，${secondPoint}。适合${audience.join('、')}。${ruleText ? `下单前看下规则：${ruleText}。` : '下单前先确认门店使用规则。'}`,
    momentsCopy: `${pkg.areaName}今天可以看这组：${pkg.merchantName}「${pkg.packageName}」。${sellingPoints.slice(0, 3).join(' / ')}，到手 ${priceText}。适合想就近安排、不想临时踩雷的人。`,
    merchantShareCopy: `门店转发版：${pkg.packageName}，到手 ${priceText}。建议突出「${leadPoint}」和「${secondPoint}」，顾客咨询时同步提醒${ruleText || '预约、可用时间和到店规则'}。`,
    followUpCopy: `刚刚看这组的朋友可以先确认库存：${stockText}。如果今天要安排，建议先下单锁住价格，再按规则预约/到店。`,
    soldOutFallbackCopy: pkg.fallbackPackageId
      ? `如果这组售罄，马上切到同店承接套餐 ${pkg.fallbackPackageId}，话术改成“这组刚售罄，给你换同店可用的替代选择”。`
      : `如果售罄，话术改成“这组刚售罄，先关注下一波补货/同类替代”，不要继续写可抢。`
  };
}

export function buildDerivedCommunities(
  packages: RecommendPackageItem[],
  cards: Map<string, OperationCard>
): {
  items: CommunityGroup[];
  // Residual #281: MAX_DERIVED_COMMUNITY_GROUPS output-cap honesty.
  groupMatched: number;
  groupLimit: number;
  groupTruncated: boolean;
} {
  const grouped = new Map<string, RecommendPackageItem[]>();
  for (const pkg of packages) {
    const key = `${pkg.areaId || pkg.areaName}:${pkg.category}`;
    grouped.set(key, [...(grouped.get(key) ?? []), pkg]);
  }

  const ranked = [...grouped.entries()]
    .map(([key, rows], index) => {
      const [areaId] = key.split(':');
      const first = rows[0];
      const avgConversion = rows.reduce((sum, row) => sum + row.conversionRate, 0) / rows.length;
      const topCards = rows
        .map((row) => cards.get(row.packageId))
        .filter((row): row is OperationCard => !!row)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const topScore = topCards[0]?.score ?? 0;
      return {
        groupId: `cg-${index + 1}-${sanitizeId(areaId)}-${sanitizeId(first.category)}`,
        groupName: `${first.areaName}${communityTypeLabel(first.category)}社群`,
        areaId,
        areaName: first.areaName,
        groupType: inferGroupType(first.category),
        memberCount: clamp(120 + rows.length * 18, 80, 500),
        activityScore: Math.round(clamp(avgConversion * 650 + topScore * 0.3)),
        historicalConversionRate: Number(avgConversion.toFixed(4)),
        preferredCategories: [first.category],
        todayRecommendedPackages: topCards
      } satisfies CommunityGroup;
    })
    .sort((a, b) => b.activityScore - a.activityScore);

  const groupLimit = MAX_DERIVED_COMMUNITY_GROUPS;
  const groupMatched = ranked.length;
  const items = ranked.slice(0, groupLimit);
  return {
    items,
    groupMatched,
    groupLimit,
    groupTruncated: groupMatched > items.length
  };
}

export function buildCommunityTasks(communities: CommunityGroup[]): CommunityPushTask[] {
  return communities.flatMap((group, index) =>
    group.todayRecommendedPackages.slice(0, 1).map((pkg) => ({
      taskId: `task-${group.groupId}-${pkg.packageId}`,
      groupId: group.groupId,
      groupName: group.groupName,
      areaName: group.areaName,
      packageId: pkg.packageId,
      packageName: pkg.packageName,
      channel: 'wechat_group' as Channel,
      plannedTime: index % 2 === 0 ? '11:30' : '17:40',
      reason: `${group.groupName}偏好${pkg.category}，套餐评分 ${pkg.score}`,
      nextAction: '生成社群文案并安排群内首推'
    }))
  );
}

/** Residual #282: daily-review list heads stay Top-N; narrative + honesty use full candidates. */
const DAILY_REVIEW_LIST_LIMIT = 5;

export function buildDailyReview(
  date: string,
  cards: OperationCard[],
  performances: Array<{
    contentId: string;
    title?: string;
    channel: Channel;
    conversionRate: number;
    orderCount: number;
    groupId?: string | null;
  }>
): DailyOperationReview {
  // Residual #282: count full candidates before Top-N slice so narrative does not freeze at 5.
  const goodCandidates = cards.filter((card) => card.score >= 75);
  const goodPackages = goodCandidates.slice(0, DAILY_REVIEW_LIST_LIMIT);
  const weakCandidates = cards.filter((card) =>
    card.tags.some((tag) => tag.key === 'continuous_slow' || tag.key === 'high_refund_risk')
  );
  const weakPackages = weakCandidates.slice(0, DAILY_REVIEW_LIST_LIMIT);
  const copyCandidates = [...performances].sort((a, b) => b.conversionRate - a.conversionRate);
  const highConversionCopies = copyCandidates.slice(0, DAILY_REVIEW_LIST_LIMIT).map((row) => ({
    contentId: row.contentId,
    title: row.title ?? '-',
    channel: row.channel,
    conversionRate: row.conversionRate,
    orderCount: row.orderCount
  }));
  const communityCandidates = performances.filter((row) => row.groupId);
  const valuableCommunities = communityCandidates.slice(0, DAILY_REVIEW_LIST_LIMIT).map((row) => ({
    groupId: row.groupId!,
    groupName: row.groupId!,
    conversionRate: row.conversionRate,
    reason:
      row.conversionRate >= HIGH_CONVERSION_RATE_THRESHOLD
        ? '昨日转化高，建议继续安排同品类'
        : '有转化基础，可继续小流量测试'
  }));

  const listLimit = DAILY_REVIEW_LIST_LIMIT;
  const goodMatched = goodCandidates.length;
  const weakMatched = weakCandidates.length;
  const copyMatched = copyCandidates.length;
  const communityMatched = communityCandidates.length;

  return {
    date,
    whatHappened: [
      `昨日共有 ${performances.length} 条推送效果记录`,
      // Residual #282: full candidate counts (not post-slice head lengths).
      `高分可推套餐 ${goodMatched} 个，风险/滞销套餐 ${weakMatched} 个`,
      highConversionCopies[0]
        ? `最高转化文案为「${highConversionCopies[0].title}」`
        : '暂无足够文案效果数据'
    ],
    goodPackages,
    weakPackages,
    highConversionCopies,
    valuableCommunities,
    tomorrowSuggestions: [
      goodPackages[0]
        ? `明天优先推「${goodPackages[0].packageName}」`
        : '明天先从高分套餐池选择 3 个测试',
      weakPackages[0]
        ? `滞销/风险套餐「${weakPackages[0].packageName}」需要换卖点或降曝光`
        : '继续监控连续未售罄套餐',
      '社群文案保留价格、库存和使用规则，避免空泛促销话术'
    ],
    // Residual #282: Top-N list-head honesty for SPA review panels.
    reviewListLimit: listLimit,
    goodMatched,
    goodTruncated: goodMatched > goodPackages.length,
    weakMatched,
    weakTruncated: weakMatched > weakPackages.length,
    copyMatched,
    copyTruncated: copyMatched > highConversionCopies.length,
    communityMatched,
    communityTruncated: communityMatched > valuableCommunities.length
  };
}

function buildSellingPoints(pkg: RecommendPackageItem, price: number) {
  const discount = pkg.originalPrice > 0 ? price / pkg.originalPrice : 1;
  const pricePoint =
    discount <= DEEP_DISCOUNT_RATIO_THRESHOLD
      ? `到手约 ${Math.round(discount * 100) / 10} 折`
      : price > 0
        ? `当前售价 ${formatPrice(price, 2)} 元`
        : '';
  const rulePoint = primaryUseRule(pkg);
  const points = uniqueText([
    ...pkg.sellingPoints.flatMap((point) => point.split(/[、，,]/)),
    pricePoint,
    `${pkg.areaName}可用`,
    rulePoint
  ]);
  return points.slice(0, 4);
}

function stockCue(pkg: RecommendPackageItem) {
  if (pkg.stockLeft <= 0) return 'JeeSite 显示当前已售罄，先确认补货或承接套餐';
  if (pkg.stockLeft <= LOW_STOCK_WARNING_THRESHOLD)
    return `JeeSite 剩余 ${pkg.stockLeft} 份，适合做限量提醒`;
  if (pkg.inventorySoldOutDays >= 2) return `近几日多次售罄，当前补到 ${pkg.stockLeft} 份`;
  if (pkg.inventoryObservedDays >= 2 && pkg.inventorySoldOutDays === 0)
    return `近 ${pkg.inventoryObservedDays} 天未售罄，当前剩余 ${pkg.stockLeft} 份`;
  return `JeeSite 剩余 ${pkg.stockLeft} 份`;
}

function primaryUseRule(pkg: ContentPackage) {
  const rules = uniqueText(pkg.useRules);
  return rules.find((rule) => rule.length <= 34) ?? rules[0] ?? '';
}

function inferAudience(pkg: ContentPackage) {
  if (/亲子|儿童|乐园/.test(pkg.category + pkg.packageName)) return ['亲子家庭', '周末出行用户'];
  if (WELLNESS_CATEGORY_RE.test(pkg.category + pkg.packageName))
    return ['下班放松用户', '附近白领'];
  if (FITNESS_CATEGORY_RE.test(pkg.category + pkg.packageName))
    return ['运动爱好者', '周末体验用户'];
  if (/双人|2人/.test(pkg.packageName)) return ['双人结伴用户', '晚餐决策用户'];
  return ['附近用户', '价格敏感用户', '本地生活高频用户'];
}

function recommendPushTime(pkg: ContentPackage) {
  if (FOODIE_CATEGORY_RE.test(pkg.category + pkg.packageName)) return '11:30 或 17:40';
  if (WELLNESS_CATEGORY_RE.test(pkg.category + pkg.packageName)) return '18:30 或 20:30';
  if (/亲子|运动|景点|门票/.test(pkg.category + pkg.packageName)) return '周五 18:00 或周六 10:00';
  return '12:00 或 18:00';
}

function inferGroupType(category: string): CommunityGroup['groupType'] {
  if (FOODIE_CATEGORY_RE.test(category)) return 'foodie';
  if (PARENT_CHILD_CATEGORY_RE.test(category)) return 'parent_child';
  if (WELLNESS_CATEGORY_RE.test(category)) return 'wellness';
  return 'mixed';
}

function communityTypeLabel(category: string) {
  if (FOODIE_CATEGORY_RE.test(category)) return '吃喝';
  if (WELLNESS_CATEGORY_RE.test(category)) return '休闲';
  if (PARENT_CHILD_CATEGORY_RE.test(category)) return '亲子';
  return '本地生活';
}

function sanitizeId(value: string) {
  return value.replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 18) || 'all';
}
