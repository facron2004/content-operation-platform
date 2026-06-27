import type { PackageScoreBreakdown, RecommendPackageItem, SalesSnapshot } from '@content/shared';
import { currentPrice } from '@content/shared';
import { clamp, scoreLevel } from './utils';

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

  const totalScore = Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0));
  return {
    totalScore,
    level: scoreLevel(totalScore),
    dimensions,
    reasons: dimensions
      .filter((item) => item.score >= 75 || item.score <= 35)
      .map((item) => `${item.label}：${item.reason}`)
  };
}
