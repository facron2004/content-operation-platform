import type {
  Channel,
  ContentPackage,
  InventoryTrendPoint,
  OperationAlert,
  OperationTag,
  PackageScoreBreakdown,
  RecommendPackageItem,
  SalesSnapshot
} from '@content/shared';
import { buildPromotionScore } from '../domain/promotion-rules';

/** getPackageAnalysis 返回类型 */
export interface PackageAnalysisResult {
  package: ContentPackage;
  status: string;
  promotionScore: number;
  inventoryBacklogDays: number;
  inventoryFlag: string;
  inventoryFlagLabel: string;
  inventoryFlagLevel: string;
  inventorySalesFlag: string;
  inventorySalesLabel: string;
  inventorySalesLevel: string;
  inventoryObservedDays: number;
  inventorySoldOutDays: number;
  inventoryUnsoldDays: number;
  inventoryTrend: InventoryTrendPoint[];
  salesData: SalesSnapshot;
  operationTags: OperationTag[];
  scoreBreakdown: PackageScoreBreakdown;
  operationAlerts: OperationAlert[];
  recommendation: {
    strategy: string;
    reason: string;
    suggestedChannels: Channel[];
    riskTips: string[];
    copyAngles: string[];
  };
  trends: Array<{ label: string; value: number }>;
}

function analysisTrends(snapshot: SalesSnapshot) {
  return [
    { label: '曝光', value: snapshot.exposureCount },
    { label: '点击', value: snapshot.clickCount },
    { label: '下单', value: snapshot.orderCount },
    { label: '支付', value: snapshot.paidOrderCount },
    { label: '核销', value: snapshot.verifyCount },
    { label: '退款', value: snapshot.refundCount }
  ];
}

export function buildPackageAnalysisResult(params: {
  pkg: ContentPackage;
  snapshot: SalesSnapshot;
  promotion: ReturnType<typeof buildPromotionScore>;
  recommendationItem: RecommendPackageItem;
  scoreBreakdown: PackageScoreBreakdown;
  operationTags: OperationTag[];
  operationAlerts: OperationAlert[];
}): PackageAnalysisResult {
  const {
    pkg,
    snapshot,
    promotion,
    recommendationItem,
    scoreBreakdown,
    operationTags,
    operationAlerts
  } = params;
  const r = recommendationItem;
  return {
    package: pkg,
    status: promotion.status,
    promotionScore: promotion.score,
    inventoryBacklogDays: r.inventoryBacklogDays,
    inventoryFlag: r.inventoryFlag,
    inventoryFlagLabel: r.inventoryFlagLabel,
    inventoryFlagLevel: r.inventoryFlagLevel,
    inventorySalesFlag: r.inventorySalesFlag,
    inventorySalesLabel: r.inventorySalesLabel,
    inventorySalesLevel: r.inventorySalesLevel,
    inventoryObservedDays: r.inventoryObservedDays,
    inventorySoldOutDays: r.inventorySoldOutDays,
    inventoryUnsoldDays: r.inventoryUnsoldDays,
    inventoryTrend: r.inventoryTrend,
    salesData: snapshot,
    operationTags,
    scoreBreakdown,
    operationAlerts,
    recommendation: {
      strategy: promotion.recommendedStrategy,
      reason: promotion.reason,
      suggestedChannels: promotion.recommendedChannels,
      riskTips: promotion.riskTips,
      copyAngles: promotion.copyAngles
    },
    trends: analysisTrends(snapshot)
  };
}
