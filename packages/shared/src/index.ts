export type UserRole =
  | 'platform_operator'
  | 'area_operator'
  | 'merchant_operator'
  | 'auditor'
  | 'admin';

export type PackageType = 'welfare' | 'commission' | 'fallback';

export type PackageStatus =
  | 'pending_launch'
  | 'cold_start'
  | 'healthy_sales'
  | 'surging'
  | 'nearly_sold_out'
  | 'sold_out'
  | 'poor_sales'
  | 'high_refund_risk'
  | 'high_verify'
  | 'low_verify'
  | 'unclear_selling_point'
  | 'conversion_weak';

export type SaleStatus = 'pending' | 'selling' | 'recycle';

export type PromotionLevel = 'S' | 'A' | 'B' | 'C' | 'D';

export type StrategyType =
  | 'preheat'
  | 'launch'
  | 'sprint'
  | 'fallback'
  | 'wake_up'
  | 'conversion_optimize'
  | 'verify_reminder'
  | 'merchant_co_promotion'
  | 'leader_growth';

export type Channel = 'wechat_group' | 'moments' | 'merchant_share';

export type AuditStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'risk';

export interface ContentPackage {
  packageId: string;
  packageName: string;
  packageType: PackageType;
  merchantId: string;
  merchantName: string;
  areaId: string;
  areaName: string;
  category: string;
  originalPrice: number;
  salePrice: number;
  welfarePrice?: number | null;
  temporarySalePrice?: number | null;
  commissionRate: number;
  grossProfit: number;
  stockTotal: number;
  stockLeft: number;
  startTime: string;
  endTime: string;
  useRules: string[];
  sellingPoints: string[];
  fallbackPackageId?: string | null;
  miniProgramPath: string;
  detailSummary?: string;
  saleStatus?: SaleStatus;
  merchantCooperationScore: number;
  areaMatchScore: number;
  timeMatchScore: number;
  historyScore: number;
}

export interface SalesSnapshot {
  packageId: string;
  areaId: string;
  merchantId: string;
  snapshotTime: string;
  exposureCount: number;
  clickCount: number;
  orderCount: number;
  paidOrderCount: number;
  refundCount: number;
  verifyCount: number;
  gmv: number;
  paidAmount: number;
  refundAmount: number;
  conversionRate: number;
  verifyRate: number;
  refundRate: number;
  sellThroughRate: number;
  remainingStock: number;
  salesSpeed: number;
}

export type InventoryFlag = 'normal' | 'unsold_today' | 'unsold_2d' | 'unsold_3d_slow';

export type InventorySalesFlag = 'observing' | 'hot_sold_out_recent' | 'slow_never_sold_out';

export type InventoryFlagLevel = 'none' | 'info' | 'warning' | 'danger';

export type InventorySalesLevel = 'none' | 'info' | 'success' | 'warning' | 'danger';

export type OperationTagKey =
  | 'hot_restock_needed'
  | 'continuous_slow'
  | 'high_refund_risk'
  | 'high_verify_quality'
  | 'ending_clearance'
  | 'price_advantage'
  | 'fallback_package'
  | 'community_focus';

export type OperationTagLevel = 'success' | 'warning' | 'danger' | 'info';

export interface OperationTag {
  key: OperationTagKey;
  label: string;
  level: OperationTagLevel;
  reason: string;
}

export interface InventoryTrendPoint {
  date: string;
  snapshotTime: string;
  remainingStock: number;
}

export interface PromotionScore {
  packageId: string;
  areaId: string;
  score: number;
  level: PromotionLevel;
  status: PackageStatus;
  recommendedStrategy: StrategyType;
  reason: string;
  riskTips: string[];
  recommendedChannels: Channel[];
  copyAngles: string[];
  calculatedAt: string;
}

export interface ScoreDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  reason: string;
}

export interface PackageScoreBreakdown {
  totalScore: number;
  level: PromotionLevel;
  dimensions: ScoreDimension[];
  reasons: string[];
}

export type OperationAlertType =
  | 'continuous_unsold'
  | 'abnormal_sold_out'
  | 'high_refund'
  | 'low_verify'
  | 'missing_use_rules'
  | 'missing_selling_points'
  | 'inventory_abnormal'
  | 'price_abnormal'
  | 'merchant_abnormal';

export interface OperationAlert {
  alertId: string;
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  type: OperationAlertType;
  level: 'info' | 'warning' | 'danger';
  title: string;
  reason: string;
  action: string;
  createdAt: string;
  priorityScore?: number;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface OperationCard {
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  category: string;
  stockLeft: number;
  currentPrice: number;
  score: number;
  level: PromotionLevel;
  tags: OperationTag[];
  reason: string;
  nextAction: string;
  recommendedChannels: Channel[];
}

export interface CommunityGroup {
  groupId: string;
  groupName: string;
  areaId: string;
  areaName: string;
  groupType: 'office' | 'parent_child' | 'foodie' | 'merchant' | 'wellness' | 'mixed';
  memberCount: number;
  activityScore: number;
  historicalConversionRate: number;
  preferredCategories: string[];
  todayRecommendedPackages: OperationCard[];
}

export interface CommunityPushTask {
  taskId: string;
  groupId: string;
  groupName: string;
  areaName: string;
  packageId: string;
  packageName: string;
  channel: Channel;
  plannedTime: string;
  reason: string;
  nextAction: string;
}

export interface DailyOperationReview {
  date: string;
  whatHappened: string[];
  goodPackages: OperationCard[];
  weakPackages: OperationCard[];
  highConversionCopies: Array<{
    contentId: string;
    title: string;
    channel: Channel;
    conversionRate: number;
    orderCount: number;
  }>;
  valuableCommunities: Array<{
    groupId: string;
    groupName: string;
    conversionRate: number;
    reason: string;
  }>;
  tomorrowSuggestions: string[];
}

export interface BattleCard {
  packageId: string;
  packageName: string;
  generatedAt: string;
  recommendationReason: string;
  targetAudience: string[];
  suitableChannels: Channel[];
  recommendedPushTime: string;
  mainSellingPoints: string[];
  riskTips: string[];
  communityCopy: string;
  momentsCopy: string;
  merchantShareCopy: string;
  followUpCopy: string;
  soldOutFallbackCopy: string;
}

export interface TodayOperationConsole {
  date: string;
  summary: {
    sellingCount: number;
    mustPushCount: number;
    riskCount: number;
    hotOpportunityCount: number;
    slowMovingCount: number;
    communityTaskCount: number;
    avgScore: number;
    dangerAlertCount: number;
    warningAlertCount: number;
    activeAlertCount: number;
    resolvedAlertCount: number;
    updatedAt: string;
    dataSource: 'JeeSite';
    sellingOnly: boolean;
  };
  mustPushPackages: OperationCard[];
  riskPackages: OperationCard[];
  hotOpportunities: OperationCard[];
  slowMovingPackages: OperationCard[];
  communityTasks: CommunityPushTask[];
  yesterdayReview: DailyOperationReview;
  alerts: OperationAlert[];
}

export interface GeneratedCopy {
  contentId: string;
  packageId: string;
  areaId: string;
  merchantId: string;
  channel: Channel;
  scenario: string;
  title: string;
  body: string;
  cta: string;
  copyVersion: string;
  strategyType: StrategyType;
  riskLevel: 'low' | 'medium' | 'high';
  riskTips: string[];
  auditStatus: AuditStatus;
  auditRemark?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CopyPerformance {
  id: string;
  contentId: string;
  packageId: string;
  channel: Channel;
  groupId?: string | null;
  leaderId?: string | null;
  exposureCount: number;
  clickCount: number;
  orderCount: number;
  paidOrderCount: number;
  verifyCount: number;
  refundCount: number;
  gmv: number;
  conversionRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateCopyRequest {
  packageId: string;
  channel: Channel;
  scenario?: string;
  tone?: string;
  copyCount: number;
  createdBy?: string;
  useAI?: boolean;
  extraInstruction?: string;
}

export interface AuditCopyRequest {
  auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>;
  auditRemark?: string;
  title?: string;
  body?: string;
}

export interface RecommendPackageItem extends ContentPackage {
  status: PackageStatus;
  promotionLevel: PromotionLevel;
  promotionScore: number;
  inventoryBacklogDays: number;
  inventoryPriority: 'normal' | 'backlog_3d';
  inventoryFlag: InventoryFlag;
  inventoryFlagLabel: string;
  inventoryFlagLevel: InventoryFlagLevel;
  inventorySalesFlag: InventorySalesFlag;
  inventorySalesLabel: string;
  inventorySalesLevel: InventorySalesLevel;
  inventoryObservedDays: number;
  inventorySoldOutDays: number;
  inventoryUnsoldDays: number;
  inventoryTrend: InventoryTrendPoint[];
  recommendedStrategy: StrategyType;
  reason: string;
  riskTips: string[];
  recommendedChannels: Channel[];
  conversionRate: number;
  verifyRate: number;
  refundRate: number;
  operationTags?: OperationTag[];
  scoreBreakdown?: PackageScoreBreakdown;
  operationAlerts?: OperationAlert[];
}

// ==================== 工具函数 ====================

export const currentPrice = (pkg: ContentPackage): number =>
  pkg.temporarySalePrice ?? pkg.salePrice;

export const formatPrice = (value?: number | null, decimals = 0): string =>
  value != null && Number.isFinite(value) ? Number(value.toFixed(decimals)).toString() : '-';

// ==================== API Response Types ====================
export * from './api-types';
