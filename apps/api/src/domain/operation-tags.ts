import type {
  OperationAlert,
  OperationTag,
  OperationTagKey,
  PackageScoreBreakdown,
  RecommendPackageItem,
  SalesSnapshot
} from '@content/shared';
import { currentPrice } from '@content/shared';

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

  if (slowByDailyStock)
    add(
      'continuous_unsold',
      'danger',
      '连续未售罄',
      `${pkg.inventoryObservedDays || pkg.inventoryUnsoldDays || 2} 天观察期内库存未清零`,
      '进入今日滞销池，前排曝光并改卖点'
    );
  if (hotByDailyStock || (pkg.stockLeft <= 0 && snapshot.salesSpeed >= 5))
    add(
      'abnormal_sold_out',
      'warning',
      '异常售罄',
      '近几日库存多次清零，售罄速度偏快',
      '确认是否需要补货，并准备承接套餐'
    );
  if (snapshot.refundRate >= 0.15)
    add(
      'high_refund',
      'danger',
      '高退款',
      `退款率 ${(snapshot.refundRate * 100).toFixed(1)}%`,
      '暂停强推，核对规则、库存和履约'
    );
  if (snapshot.paidOrderCount >= 10 && snapshot.verifyRate < 0.25)
    add(
      'low_verify',
      'warning',
      '低核销',
      `核销率 ${(snapshot.verifyRate * 100).toFixed(1)}%`,
      '生成到店提醒和预约说明'
    );
  if (pkg.useRules.length === 0)
    add(
      'missing_use_rules',
      'warning',
      '使用规则缺失',
      '套餐缺少使用规则，文案风险较高',
      '抓取详情或人工补充规则'
    );
  if (pkg.sellingPoints.length === 0)
    add(
      'missing_selling_points',
      'info',
      '卖点缺失',
      '缺少可直接用于文案的卖点',
      '从套餐明细中提取 2-4 个主推点'
    );
  if (pkg.stockTotal <= 0 || pkg.stockLeft > pkg.stockTotal)
    add(
      'inventory_abnormal',
      'danger',
      '库存异常',
      `库存 ${pkg.stockLeft}/${pkg.stockTotal}`,
      '回查 JeeSite 库存字段'
    );
  if (currentPrice(pkg) <= 0 || pkg.salePrice > pkg.originalPrice * 1.2)
    add(
      'price_abnormal',
      'danger',
      '价格异常',
      `当前售价 ${currentPrice(pkg)}，原价 ${pkg.originalPrice}`,
      '检查一口价/临时售价映射'
    );
  if (
    pkg.merchantCooperationScore < 60 ||
    (score.dimensions.find((item) => item.key === 'merchant_cooperation')?.score ?? 0) < 60
  )
    add(
      'merchant_abnormal',
      'warning',
      '商家异常',
      '商家配合度偏低',
      '避免自动强推，先联系商家确认履约'
    );

  return alerts;
}
