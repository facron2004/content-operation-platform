import type {
  BattleCard,
  Channel,
  CommunityGroup,
  CommunityPushTask,
  ContentPackage,
  DailyOperationReview,
  OperationAlert,
  OperationCard,
  OperationTag,
  OperationTagKey,
  PackageScoreBreakdown,
  RecommendPackageItem,
  SalesSnapshot
} from '@content/shared';
import { currentPrice } from '@content/shared';
import { clamp, scoreLevel } from './utils';

const tagLabels: Record<OperationTagKey, string> = {
  hot_restock_needed: '爆品待补货',
  continuous_slow: '连续滞销',
  high_refund_risk: '高退款风险',
  high_verify_quality: '高核销优质',
  ending_clearance: '临期清仓',
  price_advantage: '价格优势明显',
  fallback_package: '承接套餐',
  community_focus: '社群专推'
};

const formatPrice = (price: number) => Number(price.toFixed(2)).toString();
const compact = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/[｜|]+/g, '、')
    .trim();
const uniqueText = (items: string[]) => [...new Set(items.map(compact).filter(Boolean))];

export function buildPackageScore(
  pkg: RecommendPackageItem,
  snapshot: SalesSnapshot
): PackageScoreBreakdown {
  const price = currentPrice(pkg);
  const discount = pkg.originalPrice > 0 ? 1 - price / pkg.originalPrice : 0;
  const inventoryRatio = pkg.stockTotal > 0 ? pkg.stockLeft / pkg.stockTotal : 1;
  const soldOutRatio = pkg.stockTotal > 0 ? (pkg.stockTotal - pkg.stockLeft) / pkg.stockTotal : 0;
  const soldOutDayRatio =
    pkg.inventoryObservedDays > 0 ? pkg.inventorySoldOutDays / pkg.inventoryObservedDays : 0;
  const neverSoldOutInWindow =
    pkg.inventoryObservedDays >= 2 && pkg.inventorySoldOutDays === 0 && pkg.stockLeft > 0;
  const commissionSpace = clamp(pkg.commissionRate * 450 + pkg.grossProfit * 2);

  const dimensions = [
    {
      key: 'price_advantage',
      label: '价格优势',
      score: clamp(discount * 130),
      weight: 0.18,
      reason: discount >= 0.5 ? '折扣明显，适合作为价格钩子' : '价格优势一般，文案不要只讲便宜'
    },
    {
      key: 'inventory_pressure',
      label: '库存压力',
      score: clamp(inventoryRatio * 100),
      weight: 0.16,
      reason: neverSoldOutInWindow
        ? `近 ${pkg.inventoryObservedDays} 天库存都没有清零，需要提高曝光或换卖点`
        : inventoryRatio >= 0.7
          ? '库存承压，需要提高曝光'
          : '库存压力可控'
    },
    {
      key: 'sold_out_speed',
      label: '售罄速度',
      score: clamp(Math.max(soldOutRatio * 70 + snapshot.salesSpeed * 5, soldOutDayRatio * 100)),
      weight: 0.14,
      reason:
        soldOutDayRatio >= 0.66
          ? `近 ${pkg.inventoryObservedDays} 天有 ${pkg.inventorySoldOutDays} 天售罄，具备爆品信号`
          : snapshot.salesSpeed >= 5
            ? '销售速度较快，适合冲刺或补货判断'
            : '售罄速度偏慢'
    },
    {
      key: 'verify_rate',
      label: '核销率',
      score: clamp(snapshot.verifyRate * 120),
      weight: 0.14,
      reason: snapshot.verifyRate >= 0.7 ? '核销健康，履约质量较好' : '核销率仍需观察'
    },
    {
      key: 'refund_health',
      label: '退款健康度',
      score: clamp(100 - snapshot.refundRate * 520),
      weight: 0.13,
      reason: snapshot.refundRate >= 0.15 ? '退款偏高，推广前需人工确认规则' : '退款风险可控'
    },
    {
      key: 'merchant_cooperation',
      label: '商家配合度',
      score: clamp(pkg.merchantCooperationScore),
      weight: 0.09,
      reason: pkg.merchantCooperationScore >= 80 ? '商家配合度较好' : '商家配合度一般'
    },
    {
      key: 'area_match',
      label: '区域匹配度',
      score: clamp(pkg.areaMatchScore),
      weight: 0.08,
      reason: pkg.areaMatchScore >= 80 ? '区域匹配度较好' : '区域匹配度一般'
    },
    {
      key: 'profit_space',
      label: '利润/佣金空间',
      score: commissionSpace,
      weight: 0.08,
      reason: commissionSpace >= 70 ? '佣金和毛利空间较好' : '利润空间一般，谨慎强推'
    }
  ];

  const totalScore = Math.round(
    dimensions.reduce((sum, item) => sum + item.score * item.weight, 0)
  );
  return {
    totalScore,
    level: scoreLevel(totalScore),
    dimensions,
    reasons: dimensions
      .filter((item) => item.score >= 75 || item.score <= 35)
      .map((item) => `${item.label}：${item.reason}`)
  };
}

export function buildOperationTags(
  pkg: RecommendPackageItem,
  score: PackageScoreBreakdown,
  snapshot: SalesSnapshot,
  now = new Date()
): OperationTag[] {
  const tags: OperationTag[] = [];
  const add = (key: OperationTagKey, level: OperationTag['level'], reason: string) => {
    tags.push({ key, label: tagLabels[key], level, reason });
  };
  const price = currentPrice(pkg);
  const discount = pkg.originalPrice > 0 ? price / pkg.originalPrice : 1;
  const endHours = (new Date(pkg.endTime).getTime() - now.getTime()) / 36e5;
  const hotByDailyStock =
    pkg.inventorySalesFlag === 'hot_sold_out_recent' ||
    (pkg.inventoryObservedDays >= 2 && pkg.inventorySoldOutDays >= 2);
  const slowByDailyStock =
    pkg.inventorySalesFlag === 'slow_never_sold_out' ||
    pkg.inventoryFlag === 'unsold_3d_slow' ||
    (pkg.inventoryObservedDays >= 2 && pkg.inventorySoldOutDays === 0 && pkg.stockLeft > 0);

  if (hotByDailyStock || (pkg.stockLeft <= 0 && snapshot.salesSpeed >= 5)) {
    add(
      'hot_restock_needed',
      'success',
      `近 ${Math.max(pkg.inventoryObservedDays, pkg.inventorySoldOutDays)} 天出现连续售罄，建议确认补货或承接套餐`
    );
  }
  if (slowByDailyStock) {
    add(
      'continuous_slow',
      'danger',
      `近 ${pkg.inventoryObservedDays || pkg.inventoryUnsoldDays || 2} 天库存都没有清零，优先进入滞销处理池`
    );
  }
  if (snapshot.refundRate >= 0.15 || pkg.status === 'high_refund_risk') {
    add(
      'high_refund_risk',
      'danger',
      `退款率 ${(snapshot.refundRate * 100).toFixed(1)}%，需要人工确认`
    );
  }
  if (snapshot.verifyRate >= 0.7 && snapshot.refundRate <= 0.05) {
    add('high_verify_quality', 'success', '核销质量好，适合做口碑和商家共推');
  }
  if (endHours > 0 && endHours <= 48 && pkg.stockLeft > 0) {
    add('ending_clearance', 'warning', '距离结束不足 48 小时，适合清仓提醒');
  }
  if (discount <= 0.5 && price > 0) {
    add('price_advantage', 'success', '当前价低于原价 5 折，可突出价格利益点');
  }
  if (pkg.packageType === 'fallback' || pkg.fallbackPackageId) {
    add('fallback_package', 'info', '可作为售罄后的同店承接选择');
  }
  if (
    score.totalScore >= 70 &&
    pkg.stockLeft > 0 &&
    pkg.recommendedChannels.includes('wechat_group') &&
    !tags.some((tag) => tag.level === 'danger')
  ) {
    add('community_focus', 'info', '分数和库存适合安排社群专推');
  }

  return tags;
}

export function buildOperationAlerts(
  pkg: RecommendPackageItem,
  score: PackageScoreBreakdown,
  snapshot: SalesSnapshot,
  now = new Date()
): OperationAlert[] {
  const alerts: OperationAlert[] = [];
  const add = (
    type: OperationAlert['type'],
    level: OperationAlert['level'],
    title: string,
    reason: string,
    action: string
  ) => {
    alerts.push({
      alertId: `${pkg.packageId}:${type}`,
      packageId: pkg.packageId,
      packageName: pkg.packageName,
      merchantName: pkg.merchantName,
      areaName: pkg.areaName,
      type,
      level,
      title,
      reason,
      action,
      createdAt: now.toISOString()
    });
  };
  const slowByDailyStock =
    pkg.inventorySalesFlag === 'slow_never_sold_out' ||
    pkg.inventoryFlag === 'unsold_3d_slow' ||
    (pkg.inventoryObservedDays >= 2 && pkg.inventorySoldOutDays === 0 && pkg.stockLeft > 0);
  const hotByDailyStock =
    pkg.inventorySalesFlag === 'hot_sold_out_recent' ||
    (pkg.inventoryObservedDays >= 2 && pkg.inventorySoldOutDays >= 2);

  if (slowByDailyStock) {
    add(
      'continuous_unsold',
      'danger',
      '连续未售罄',
      `${pkg.inventoryObservedDays || pkg.inventoryUnsoldDays || 2} 天观察期内库存未清零`,
      '进入今日滞销池，前排曝光并改卖点'
    );
  }
  if (hotByDailyStock || (pkg.stockLeft <= 0 && snapshot.salesSpeed >= 5)) {
    add(
      'abnormal_sold_out',
      'warning',
      '异常售罄',
      '近几日库存多次清零，售罄速度偏快',
      '确认是否需要补货，并准备承接套餐'
    );
  }
  if (snapshot.refundRate >= 0.15) {
    add(
      'high_refund',
      'danger',
      '高退款',
      `退款率 ${(snapshot.refundRate * 100).toFixed(1)}%`,
      '暂停强推，核对规则、库存和履约'
    );
  }
  if (snapshot.paidOrderCount >= 10 && snapshot.verifyRate < 0.25) {
    add(
      'low_verify',
      'warning',
      '低核销',
      `核销率 ${(snapshot.verifyRate * 100).toFixed(1)}%`,
      '生成到店提醒和预约说明'
    );
  }
  if (pkg.useRules.length === 0) {
    add(
      'missing_use_rules',
      'warning',
      '使用规则缺失',
      '套餐缺少使用规则，文案风险较高',
      '抓取详情或人工补充规则'
    );
  }
  if (pkg.sellingPoints.length === 0) {
    add(
      'missing_selling_points',
      'info',
      '卖点缺失',
      '缺少可直接用于文案的卖点',
      '从套餐明细中提取 2-4 个主推点'
    );
  }
  if (pkg.stockTotal <= 0 || pkg.stockLeft > pkg.stockTotal) {
    add(
      'inventory_abnormal',
      'danger',
      '库存异常',
      `库存 ${pkg.stockLeft}/${pkg.stockTotal}`,
      '回查 JeeSite 库存字段'
    );
  }
  if (currentPrice(pkg) <= 0 || pkg.salePrice > pkg.originalPrice * 1.2) {
    add(
      'price_abnormal',
      'danger',
      '价格异常',
      `当前售价 ${currentPrice(pkg)}，原价 ${pkg.originalPrice}`,
      '检查一口价/临时售价映射'
    );
  }
  if (
    pkg.merchantCooperationScore < 60 ||
    (score.dimensions.find((item) => item.key === 'merchant_cooperation')?.score ?? 0) < 60
  ) {
    add(
      'merchant_abnormal',
      'warning',
      '商家异常',
      '商家配合度偏低',
      '避免自动强推，先联系商家确认履约'
    );
  }

  return alerts;
}

export function toOperationCard(
  pkg: RecommendPackageItem,
  score: PackageScoreBreakdown,
  tags: OperationTag[]
): OperationCard {
  const primaryTag = tags[0];
  return {
    packageId: pkg.packageId,
    packageName: pkg.packageName,
    merchantName: pkg.merchantName,
    areaName: pkg.areaName,
    category: pkg.category,
    stockLeft: pkg.stockLeft,
    currentPrice: currentPrice(pkg),
    score: score.totalScore,
    level: score.level,
    tags,
    reason: primaryTag?.reason ?? pkg.reason,
    nextAction: nextActionFor(pkg, tags),
    recommendedChannels: pkg.recommendedChannels
  };
}

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
  const priceText = `${formatPrice(price)} 元`;
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
    generatedAt: new Date().toISOString(),
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
): CommunityGroup[] {
  const grouped = new Map<string, RecommendPackageItem[]>();
  for (const pkg of packages) {
    const key = `${pkg.areaId || pkg.areaName}:${pkg.category}`;
    grouped.set(key, [...(grouped.get(key) ?? []), pkg]);
  }

  return Array.from(grouped.entries())
    .map(([key, rows], index) => {
      const [areaId] = key.split(':');
      const first = rows[0];
      const avgConversion = rows.reduce((sum, row) => sum + row.conversionRate, 0) / rows.length;
      const topCards = rows
        .map((row) => cards.get(row.packageId))
        .filter((row): row is OperationCard => Boolean(row))
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
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, 12);
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
  const goodPackages = cards.filter((card) => card.score >= 75).slice(0, 5);
  const weakPackages = cards
    .filter((card) =>
      card.tags.some((tag) => tag.key === 'continuous_slow' || tag.key === 'high_refund_risk')
    )
    .slice(0, 5);
  const highConversionCopies = [...performances]
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 5)
    .map((row) => ({
      contentId: row.contentId,
      title: row.title ?? '-',
      channel: row.channel,
      conversionRate: row.conversionRate,
      orderCount: row.orderCount
    }));
  const valuableCommunities = performances
    .filter((row) => row.groupId)
    .slice(0, 5)
    .map((row) => ({
      groupId: row.groupId!,
      groupName: row.groupId!,
      conversionRate: row.conversionRate,
      reason:
        row.conversionRate >= 0.12
          ? '昨日转化高，建议继续安排同品类'
          : '有转化基础，可继续小流量测试'
    }));

  return {
    date,
    whatHappened: [
      `昨日共有 ${performances.length} 条推送效果记录`,
      `高分可推套餐 ${goodPackages.length} 个，风险/滞销套餐 ${weakPackages.length} 个`,
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
    ]
  };
}

function nextActionFor(pkg: RecommendPackageItem, tags: OperationTag[]) {
  if (tags.some((tag) => tag.key === 'hot_restock_needed'))
    return '联系商家确认补货，同时准备售罄承接文案';
  if (tags.some((tag) => tag.key === 'continuous_slow'))
    return '进入滞销前排池，重写卖点并安排社群测试';
  if (tags.some((tag) => tag.key === 'high_refund_risk'))
    return '暂停强推，先核对使用规则和商家履约';
  if (tags.some((tag) => tag.key === 'ending_clearance'))
    return '今天安排清仓提醒，突出截止时间和库存';
  if (pkg.recommendedChannels.includes('wechat_group')) return '生成作战卡并推送到匹配社群';
  return '进入今日观察池，等待下一轮库存快照';
}

function buildSellingPoints(pkg: RecommendPackageItem, price: number) {
  const discount = pkg.originalPrice > 0 ? price / pkg.originalPrice : 1;
  const pricePoint =
    discount <= 0.5
      ? `到手约 ${Math.round(discount * 100) / 10} 折`
      : price > 0
        ? `当前售价 ${formatPrice(price)} 元`
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
  if (pkg.stockLeft <= 10) return `JeeSite 剩余 ${pkg.stockLeft} 份，适合做限量提醒`;
  if (pkg.inventorySoldOutDays >= 2) return `近几日多次售罄，当前补到 ${pkg.stockLeft} 份`;
  if (pkg.inventoryObservedDays >= 2 && pkg.inventorySoldOutDays === 0)
    return `近 ${pkg.inventoryObservedDays} 天未售罄，当前剩余 ${pkg.stockLeft} 份`;
  return `JeeSite 剩余 ${pkg.stockLeft} 份`;
}

function primaryUseRule(pkg: ContentPackage) {
  return (
    uniqueText(pkg.useRules).find((rule) => rule.length <= 34) ?? uniqueText(pkg.useRules)[0] ?? ''
  );
}

function inferAudience(pkg: ContentPackage) {
  if (/亲子|儿童|乐园/.test(pkg.category + pkg.packageName)) return ['亲子家庭', '周末出行用户'];
  if (/水疗|按摩|足浴|SPA|汤泉/.test(pkg.category + pkg.packageName))
    return ['下班放松用户', '附近白领'];
  if (/健身|运动|练习场/.test(pkg.category + pkg.packageName))
    return ['运动爱好者', '周末体验用户'];
  if (/双人|2人/.test(pkg.packageName)) return ['双人结伴用户', '晚餐决策用户'];
  return ['附近用户', '价格敏感用户', '本地生活高频用户'];
}

function recommendPushTime(pkg: ContentPackage) {
  if (/餐|饭|烧烤|火锅|甜品|饮品/.test(pkg.category + pkg.packageName)) return '11:30 或 17:40';
  if (/按摩|水疗|足浴|汤泉/.test(pkg.category + pkg.packageName)) return '18:30 或 20:30';
  if (/亲子|运动|景点|门票/.test(pkg.category + pkg.packageName)) return '周五 18:00 或周六 10:00';
  return '12:00 或 18:00';
}

function inferGroupType(category: string): CommunityGroup['groupType'] {
  if (/餐|饮|甜品|烧烤|火锅|中餐|西餐/.test(category)) return 'foodie';
  if (/亲子|儿童/.test(category)) return 'parent_child';
  if (/按摩|水疗|足浴|美容|美发|SPA|汤泉/.test(category)) return 'wellness';
  return 'mixed';
}

function communityTypeLabel(category: string) {
  if (/餐|饮|甜品|烧烤|火锅|中餐|西餐/.test(category)) return '吃喝';
  if (/按摩|水疗|足浴|美容|美发|SPA|汤泉/.test(category)) return '休闲';
  if (/亲子|儿童/.test(category)) return '亲子';
  return '本地生活';
}

function sanitizeId(value: string) {
  return value.replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 18) || 'all';
}
