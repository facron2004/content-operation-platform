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

// ============================================================================
// 跨服务查询契约 (cross-service query contracts)
// 后端 service 之间共用,未来前端可复用。统一放在 shared 避免重复定义。
// ============================================================================

/** /api/content/recommend 接口的查询条件 */
export interface RecommendQuery {
  date?: string;
  areaId?: string;
  merchantId?: string;
  role?: UserRole;
  status?: 'selling';
  category?: string;
  inventoryMin?: number;
  inventoryMax?: number;
  inventoryFlag?: 'unsold';
}

/** /api/content/recommend 接口的返回结构 */
export interface RecommendationResult {
  date: string;
  areaId: string;
  packages: RecommendPackageItem[];
}

/** /api/content/alerts 接口的查询条件 */
export interface AlertQuery {
  role?: UserRole;
  level?: OperationAlert['level'];
  type?: OperationAlert['type'];
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// Snapshot utilities (跨前后端共用)
// ============================================================================

/** 按 packageId 取每个套餐的最新快照 */
export function latestSnapshotsByPackage<T extends { packageId: string; snapshotTime: string }>(
  snapshots: T[]
): Map<string, T> {
  const result = new Map<string, T>();
  for (const snapshot of snapshots) {
    const previous = result.get(snapshot.packageId);
    if (
      !previous ||
      new Date(snapshot.snapshotTime).getTime() > new Date(previous.snapshotTime).getTime()
    ) {
      result.set(snapshot.packageId, snapshot);
    }
  }
  return result;
}

/** 从快照列表中取指定 packageId 的最新快照(简化版) */
export function latestSnapshotForPackage<T extends { packageId: string; snapshotTime: string }>(
  snapshots: T[],
  packageId: string
): T | null {
  let best: T | null = null;
  let bestTime = 0;
  for (const s of snapshots) {
    if (s.packageId !== packageId) continue;
    const t = new Date(s.snapshotTime).getTime();
    if (Number.isFinite(t) && t > bestTime) {
      best = s;
      bestTime = t;
    }
  }
  return best;
}

/** 格式化日期为 YYYY-MM-DD(本地时间) */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// 分页工具 (跨前后端共用)
// ============================================================================

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * 通用分页切片。给定全量 items + 可选 page/pageSize,返回切片与标准 pagination 元数据。
 * - page 默认为 1;pageSize 默认为 50,上限 200(防止前端请求巨页)
 * - total 缺省按 items.length 计算;外部传入可用于"已分页的二次切片"等场景
 */
export function paginate<T>(
  items: T[],
  page?: number,
  pageSize?: number,
  total?: number
): PaginatedResult<T> {
  const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize ?? 50)));
  const safePage = Math.max(1, Math.floor(page ?? 1));
  const safeTotal = total ?? items.length;
  const offset = (safePage - 1) * safePageSize;
  return {
    items: items.slice(offset, offset + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: safeTotal,
      totalPages: Math.max(1, Math.ceil(safeTotal / safePageSize))
    }
  };
}

/**
 * 解析 Prisma query 的分页参数。返回 { page, pageSize, offset, totalPages }。
 * 适用于"先 count 再 findMany"的 Prisma 模式。
 */
export function resolvePagination(page?: number, pageSize?: number, total = 0) {
  const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize ?? 50)));
  const safePage = Math.max(1, Math.floor(page ?? 1));
  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize))
  };
}

// ============================================================================
// InventoryFlag 输入/输出 (跨模块复用,数据源适配器、爬虫、推荐 service 三方共用)
// ============================================================================

export interface InventoryFlagInput {
  currentStockLeft: number;
  saleStatus?: SaleStatus;
  /** 已通过 normalizeInventoryTrend() 处理过的趋势。批量调用方负责预先 normalize 以避免重复 */
  normalizedTrend: InventoryTrendPoint[];
}

export interface InventoryFlagResult {
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
  priority: number;
}

// ============================================================================
// 枚举常量 (as const)
// 与 type aliases 同源 —— DTO 校验、service 过滤、mappers castEnum 共用
// 改一处即可同步所有引用方
// ============================================================================

export const CHANNELS = ['wechat_group', 'moments', 'merchant_share'] as const;
export const AUDIT_DECISION_STATUSES = ['approved', 'rejected', 'risk'] as const;
export const ALERT_LEVELS = ['info', 'warning', 'danger'] as const;
export const ALERT_TYPES = [
  'continuous_unsold',
  'abnormal_sold_out',
  'high_refund',
  'low_verify',
  'missing_use_rules',
  'missing_selling_points',
  'inventory_abnormal',
  'price_abnormal',
  'merchant_abnormal'
] as const;
export const PACKAGE_TYPES = ['welfare', 'commission', 'fallback'] as const;
export const SALE_STATUSES = ['pending', 'selling', 'recycle'] as const;
export const INVENTORY_PRIORITIES = ['normal', 'backlog_3d'] as const;

// ==================== API Response Types ====================
export * from './api-types';
