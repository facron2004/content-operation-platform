export type UserRole =
  | 'platform_operator'
  | 'area_operator'
  | 'merchant_operator'
  | 'auditor'
  | 'admin';

export const USER_ROLES: readonly UserRole[] = [
  'platform_operator',
  'area_operator',
  'merchant_operator',
  'auditor',
  'admin'
];

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

export const formatPrice = (value?: number | null, decimals = 0): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  // toFixed 返回带末尾 0 的字符串,Number() 转回 number 会自动去除
  return Number(value.toFixed(decimals)).toString();
};

/**
 * 百分比格式化(0.123 -> "12.3%"),NaN/null 回落为 '-'。
 * 前后端文案共用,避免各自维护一套 (rate * 100).toFixed(N) + '%'。
 */
export const formatRatePercent = (value?: number | null, decimals = 1): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
};

/** 文案版本号字母表(A-E) —— 模板生成与 AI 生成共用,避免各路径重复定义 */
export const COPY_VERSION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

/** 默认运营场景(用户未填 scenario 时回落) —— 模板/AI 两条路径共用 */
export const DEFAULT_SCENARIO = '日常运营推荐';

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

/** 把数字格式化为两位字符串(前导 0) */
const padTwo = (n: number): string => String(n).padStart(2, '0');

/** 将数值限制在 [min, max] 范围内(默认 [0, 100]) */
export const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));

/** 把数值钳到非负数 —— 不复用 clamp 是因为 clamp 默认 max=100 会误伤大于 100 的合法值。 */
export const clampNonNegative = (value: number): number => Math.max(0, value);

/**
 * 安全除法(分母为 0 时返回 0),保留 precision 位小数。
 * 跨前后端业务统计共用,避免 NaN 污染分数/比率字段。
 */
export const safeRatio = (numerator: number, denominator: number, precision = 4): number =>
  denominator === 0 ? 0 : Number((numerator / denominator).toFixed(precision));

/**
 * 指数退避(2^attempt * base),结果被 maxMs 封顶。
 * 前后端共用 —— ai-copy/retry.handler、content/data-source、
 * auto-login 登录冷却、web http-client 请求重试都依赖同一公式。
 */
export const exponentialBackoff = (attempt: number, baseMs: number, maxMs: number): number =>
  Math.min(maxMs, baseMs * Math.pow(2, attempt));

/** sleep N 毫秒 — 跨重试/退避路径共用,避免每个文件都重写 setTimeout 包装。 */
export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** 当前时间的 ISO 字符串(UTC),统一封装以避免散落的 new Date().toISOString()。 */
export const nowISO = (date: Date = new Date()): string => date.toISOString();

/** 从 now 起 offsetMs 之后的 ISO 字符串(UTC),用于 fallback 到期时间等场景。 */
export const futureISO = (offsetMs: number): string =>
  new Date(Date.now() + offsetMs).toISOString();

/** 毫秒时间戳 → ISO 字符串;0/负数返回 null,方便 API 层表达"从未发生"。 */
export const msToISO = (ms: number): string | null => (ms > 0 ? new Date(ms).toISOString() : null);

/** 格式化日期为 YYYY-MM-DD(本地时间) */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  return `${year}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

/** 业务"日期"统一按北京时间 (UTC+8) 切日。
 *
 *  为什么不用 `localDateKey`:
 *  Node 在 Linux 服务器默认 UTC,在 Windows 是本地时区;部署到任何机房都不一致。
 *  显式按 +08:00 取日,可以保证"业务今天"和 JeSite 后台的"今天"对得上。
 *
 *  切日点:北京 0:00 = UTC 16:00(前一天)。即 UTC 16:00:00 之后的请求算"新的一天"。
 */
export function beijingDateKey(input: Date | string | number = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  // toISOString 是 UTC;取前 10 char 后,如果 UTC 时间 >= 16:00:00,Beijing 已经进入"次日",
  // 这时要按"UTC 日期 + 1"取日。
  const utcDateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD of UTC clock
  const utcHour = d.getUTCHours();
  if (utcHour >= 16) {
    // UTC >=16 时 = Beijing 已经到次日;把 UTC 日期字符串推进一天。
    return shiftDateString(utcDateStr, 1);
  }
  return utcDateStr;
}

/** 给定 YYYY-MM-DD,加 N 天,返回新的 YYYY-MM-DD(支持负数)。
 *  用 Date.UTC 避免任何时区修正,纯日历计算。 */
function shiftDateString(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const shifted = new Date(t);
  return `${shifted.getUTCFullYear()}-${padTwo(shifted.getUTCMonth() + 1)}-${padTwo(shifted.getUTCDate())}`;
}

/** 给定 Beijing 当天的 YYYY-MM-DD,返回对应的 UTC 时间范围 [dayStart, dayEnd):
 *   dayStart = 北京 0:00 (= UTC 16:00 前一日)
 *   dayEnd   = 北京次日 0:00 (= UTC 16:00 当日)
 *
 *  传给 Prisma where orderTime 时,用 dayStart..dayEnd 即可保证：
 *  - 北京 7/15 0:00 的订单  → orderTime=UTC 7/14 16:00  → 落在 dayStart..dayEnd [..) 区间
 *  - 北京 7/15 23:59 的订单 → orderTime=UTC 7/15 15:59  → 仍在区间
 *  - 北京 7/16 0:00 的订单  → orderTime=UTC 7/15 16:00  → 已经在新一天 [..)
 *
 *  返回 [start, end),end 是排他的,SQL 写 `< end` 即可。
 */
export function beijingDayRangeUtc(date: string): { start: Date; end: Date } {
  // 直接拿"YYYY-MM-DDT00:00:00+08:00"解析 — Node 的 Date 解析器原生支持 ISO + 时区偏移
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

/** 生成 5 位 base36 随机后缀,用于短 ID(contentId 等不需要密码学强度的场景) */
export const randomShortId = (): string => Math.random().toString(36).slice(2, 7);

/**
 * 把任意错误归一成"是否来自 axios"。避免在 shared 层硬依赖 axios,
 * web 端通过 options.isAxiosError 传入 axios.isAxiosError,其它环境(null/undefined)
 * 统一走 Error / 兜底分支,保持前后端都能复用。
 */
type AxiosLikeError = {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number; data?: unknown };
};

export interface ExtractErrorMessageOptions {
  /** 判别 axios 错误。web 端传入 `axios.isAxiosError`,其它端不传。 */
  isAxiosError?: (error: unknown) => error is AxiosLikeError;
  /** 兜底文案 */
  fallback?: string;
  /** 读 message / error 字段时使用的键名集合,默认 ['message', 'error'] */
  responseMessageKeys?: readonly string[];
}

const DEFAULT_RESPONSE_KEYS: readonly string[] = ['message', 'error'];

const readResponseMessage = (data: unknown, keys: readonly string[]): string | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
};

/** 把任意 thrown 值归一成可读字符串(优先 Error.message),用于 catch 后的日志。 */
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * 从任意错误对象中抽取可展示给用户的字符串。
 * - axios 错误:优先读 response.data.message / error,再按状态码/超时/无响应分支回落
 * - 普通 Error:返回 .message
 * - 其它:返回 fallback
 * web 端常见错误处理统一走这里,避免重复 isinstance 判断。
 */
export function extractErrorMessage(
  error: unknown,
  options: ExtractErrorMessageOptions = {}
): string {
  const {
    isAxiosError,
    fallback = '请求失败',
    responseMessageKeys = DEFAULT_RESPONSE_KEYS
  } = options;
  if (isAxiosError && isAxiosError(error)) {
    const axiosLike = error as AxiosLikeError;
    const message = readResponseMessage(axiosLike.response?.data, responseMessageKeys);
    if (message) return message;
    if (axiosLike.code === 'ECONNABORTED' || /timeout/i.test(axiosLike.message ?? '')) {
      return '请求超时,请稍后重试';
    }
    if (!axiosLike.response) return '网络连接失败,请检查网络';
    const status = axiosLike.response.status;
    if (typeof status === 'number') return `请求失败 (${status})`;
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ============================================================================
// 分页工具 (跨前后端共用)
// ============================================================================

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
  const safePageSize = clamp(Math.floor(pageSize ?? 50), 1, 200);
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
  const safePageSize = clamp(Math.floor(pageSize ?? 50), 1, 200);
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

/** 非数组的对象守卫,跨 API/前端共用,避免重复 `typeof === 'object' && !== null` 写法。 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ==================== 规则配置类型 ====================
export const RULE_TYPES = ['promotion', 'copy', 'inventory', 'alert'] as const;
export type RuleType = typeof RULE_TYPES[number];

export type RuleConfigPayload = Record<string, unknown>;

export interface RuleConfig {
  id: string;
  tenantId?: string | null;
  merchantId?: string | null;
  type: RuleType;
  name: string;
  version: number;
  isActive: boolean;
  payload: RuleConfigPayload;
  comment?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==================== API Response Types ====================
export * from './api-types';
