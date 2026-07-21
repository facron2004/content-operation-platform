import type {
  OperationCard,
  RecommendPackageItem,
  PackageScoreBreakdown,
  OperationTag
} from '@content/shared';
import { currentPrice } from '@content/shared';

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

function nextActionFor(pkg: RecommendPackageItem, tags: OperationTag[]) {
  const tagKeys = new Set(tags.map((tag) => tag.key));
  if (tagKeys.has('hot_restock_needed')) return '联系商家确认补货，同时准备售罄承接文案';
  if (tagKeys.has('continuous_slow')) return '进入滞销前排池，重写卖点并安排社群测试';
  if (tagKeys.has('high_refund_risk')) return '暂停强推，先核对使用规则和商家履约';
  if (tagKeys.has('ending_clearance')) return '今天安排清仓提醒，突出截止时间和库存';
  if (pkg.recommendedChannels.includes('wechat_group')) return '生成作战卡并推送到匹配社群';
  return '进入今日观察池，等待下一轮库存快照';
}
