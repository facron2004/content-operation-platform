import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  Channel,
  ContentPackage,
  InventoryTrendPoint,
  OperationAlert,
  OperationTag,
  PackageScoreBreakdown,
  RecommendPackageItem,
  RecommendQuery,
  RecommendationResult,
  SalesSnapshot,
  UserRole
} from '@content/shared';
import { INVENTORY_PRIORITIES, latestSnapshotsByPackage, localDateKey } from '@content/shared';
import { buildPromotionScore } from '../domain/promotion-rules';
import {
  buildBattleCard,
  buildDerivedCommunities,
  buildOperationAlerts,
  buildOperationTags,
  buildPackageScore
} from '../domain/operation-rules';
import {
  getFallbackDate,
  INVENTORY_BACKLOG_DAYS_THRESHOLD,
  MS_PER_DAY,
  sortByDateKey
} from '../domain/utils';
import { DataSourceService } from './data-source.service';
import { buildInventoryFlag, normalizeInventoryTrend } from './inventory-flags';
import { AICopyService, type AICopyConfigUpdate } from './ai-copy.service';
import { DailyInventoryCrawlerService } from './daily-inventory-crawler.service';
import {
  resolvePackageAndSnapshot as resolveFromSource,
  buildOperationCardMap
} from './package-detail-helpers';

// 重新导出共享类型,保持外部模块向后兼容
// (其它模块原来从 './content.service' 引用这些类型,无需改 import)
export type { RecommendQuery, RecommendationResult };

// ============================================================================
// 推荐计算批量化
// ----------------------------------------------------------------------------
// 旧实现里 buildRecommendPackageItem 对每个 package 串行调用 4 个 domain 函数
// + 内部重复 normalize inventory trend,数百套餐 N+1 严重。
// 下方 buildRecommendPackageItems 做单次循环,共享 now/todayKey/normalize 结果。
// ============================================================================

/** 批处理内部条目:item 是给前端的最终结果,promotion 保留给 getPackageAnalysis 复用 */
interface InternalRecommendItem {
  item: RecommendPackageItem;
  promotion: ReturnType<typeof buildPromotionScore>;
}

/** 动态兜底日期:取当前时间往前推 1 天,避免硬编码过期日期。 */
function getPromotionNow(): Date {
  return getFallbackDate();
}

/** 当日是否已在 trend 中;不在则补一条 (date=today, remainingStock=stockLeft) */
function ensureTodayInTrend(
  trend: InventoryTrendPoint[],
  stockLeft: number,
  snapshotTime: string
): InventoryTrendPoint[] {
  const snapshotDate = new Date(snapshotTime);
  const date = Number.isFinite(snapshotDate.getTime())
    ? localDateKey(snapshotDate)
    : localDateKey(new Date());
  if (trend.some((point) => point.date === date)) return trend;
  return [...trend, { date, snapshotTime, remainingStock: stockLeft }];
}

/** 售罄前已上线的天数;若 snapshot 在 start 之前/无效返回 0 */
function computeInventoryBacklogDays(pkg: ContentPackage, snapshot: SalesSnapshot): number {
  const start = new Date(pkg.startTime).getTime();
  const snap = new Date(snapshot.snapshotTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(snap) || snap <= start) return 0;
  return Math.floor((snap - start) / MS_PER_DAY);
}

/** 库存 flag 优先级:normal < unsold_today < unsold_2d < unsold_3d_slow */
const INVENTORY_PRIORITY_RANK: Record<RecommendPackageItem['inventoryFlag'], number> = {
  normal: 0,
  unsold_today: 1,
  unsold_2d: 2,
  unsold_3d_slow: 3
};

const inventoryPriorityRank = (flag: RecommendPackageItem['inventoryFlag']): number =>
  INVENTORY_PRIORITY_RANK[flag];

/**
 * 批量计算推荐套餐列表的派生字段(promotion / inventory / score / tags / alerts)。
 *
 * 输入:已经过滤过的 packages + snapshot map + inventory trends + asOf 时间。
 * 输出:每个 package 对应一个完整的 RecommendPackageItem,按 (inventoryFlag, backlog, stockLeft, score) 排序。
 *
 * 不变量:每个 item 的字段值与原 buildRecommendPackageItem 完全一致。
 */
function buildRecommendPackageItems(
  packages: ContentPackage[],
  snapshotsByPkg: Map<string, SalesSnapshot>,
  inventoryTrends: Map<string, InventoryTrendPoint[]>,
  asOf: Date
): InternalRecommendItem[] {
  const now = getPromotionNow();
  const result: InternalRecommendItem[] = [];

  for (const pkg of packages) {
    const snapshot = snapshotsByPkg.get(pkg.packageId);
    if (!snapshot) continue;

    // 1. promotion (含 status / score / strategy)
    const promotion = buildPromotionScore(pkg, snapshot, now);

    // 2. inventory flag —— trend 只 normalize 一次
    const stockLeft = pkg.stockLeft;
    const rawTrend = inventoryTrends.get(pkg.packageId) ?? [];
    const ensuredTrend = ensureTodayInTrend(rawTrend, stockLeft, snapshot.snapshotTime);
    const normalizedTrend = normalizeInventoryTrend(ensuredTrend);

    const inventoryBacklogDays = computeInventoryBacklogDays(pkg, snapshot);
    const inventoryPriority: RecommendPackageItem['inventoryPriority'] =
      stockLeft > 0 && inventoryBacklogDays >= INVENTORY_BACKLOG_DAYS_THRESHOLD
        ? INVENTORY_PRIORITIES[1]
        : INVENTORY_PRIORITIES[0];

    const inventory = buildInventoryFlag({
      currentStockLeft: stockLeft,
      saleStatus: pkg.saleStatus,
      normalizedTrend
    });

    // 3. 基础 baseItem
    const baseItem: RecommendPackageItem = {
      ...pkg,
      status: promotion.status,
      promotionLevel: promotion.level,
      promotionScore: promotion.score,
      inventoryBacklogDays,
      inventoryPriority,
      inventoryFlag: inventory.inventoryFlag,
      inventoryFlagLabel: inventory.inventoryFlagLabel,
      inventoryFlagLevel: inventory.inventoryFlagLevel,
      inventorySalesFlag: inventory.inventorySalesFlag,
      inventorySalesLabel: inventory.inventorySalesLabel,
      inventorySalesLevel: inventory.inventorySalesLevel,
      inventoryObservedDays: inventory.inventoryObservedDays,
      inventorySoldOutDays: inventory.inventorySoldOutDays,
      inventoryUnsoldDays: inventory.inventoryUnsoldDays,
      inventoryTrend: inventory.inventoryTrend,
      recommendedStrategy: promotion.recommendedStrategy,
      reason: promotion.reason,
      riskTips: promotion.riskTips,
      recommendedChannels: promotion.recommendedChannels,
      conversionRate: snapshot.conversionRate,
      verifyRate: snapshot.verifyRate,
      refundRate: snapshot.refundRate
    };

    // 4. score / tags / alerts (依赖 baseItem + scoreBreakdown)
    const scoreBreakdown = buildPackageScore(baseItem, snapshot);
    const operationTags = buildOperationTags(baseItem, scoreBreakdown, snapshot, asOf);
    const operationAlerts = buildOperationAlerts(baseItem, scoreBreakdown, snapshot, asOf);

    const item: RecommendPackageItem = {
      ...baseItem,
      // 注意:此处 promotionScore 用 scoreBreakdown.totalScore 覆盖 promotion.score,
      // 与原 buildRecommendPackageItem (line 290-293) 行为一致
      promotionScore: scoreBreakdown.totalScore,
      promotionLevel: scoreBreakdown.level,
      scoreBreakdown,
      operationTags,
      operationAlerts
    };

    result.push({ item, promotion });
  }

  // 单次 sort —— 内联优先级 rank,避免 N log N 次 inventoryPriorityRank 闭包调用
  const isBacklog = (item: RecommendPackageItem) =>
    item.inventoryPriority === INVENTORY_PRIORITIES[1];
  result.sort((a, b) => {
    const ai = a.item;
    const bi = b.item;
    const inventoryDelta =
      inventoryPriorityRank(bi.inventoryFlag) - inventoryPriorityRank(ai.inventoryFlag);
    if (inventoryDelta !== 0) return inventoryDelta;
    const priorityDelta = Number(isBacklog(bi)) - Number(isBacklog(ai));
    if (priorityDelta !== 0) return priorityDelta;
    if (bi.stockLeft !== ai.stockLeft) return bi.stockLeft - ai.stockLeft;
    if (bi.inventoryBacklogDays !== ai.inventoryBacklogDays) {
      return bi.inventoryBacklogDays - ai.inventoryBacklogDays;
    }
    return bi.promotionScore - ai.promotionScore;
  });

  return result;
}

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

/** 推荐结果缓存条目 */
interface CachedRecommendations {
  data: { date: string; areaId: string; packages: RecommendPackageItem[] };
  expiresAt: number;
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly recommendationCache = new Map<string, CachedRecommendations>();
  private readonly recommendationInFlight = new Map<
    string,
    Promise<{ date: string; areaId: string; packages: RecommendPackageItem[] }>
  >();
  private readonly recommendationCacheTtlMs = Number.parseInt(
    process.env.CONTENT_RECOMMENDATION_CACHE_TTL_MS ?? process.env.CONTENT_CACHE_TTL_MS ?? '60000',
    10
  );
  private readonly recommendationCacheMaxSize = 50;

  constructor(
    @Inject(DataSourceService) private readonly dataSource: DataSourceService,
    @Inject(AICopyService) private readonly aiCopyService: AICopyService,
    @Inject(DailyInventoryCrawlerService)
    private readonly dailyInventoryCrawler: DailyInventoryCrawlerService
  ) {}

  // ==================== 缓存管理 ====================

  private recommendationCacheKey(query: RecommendQuery): string {
    const parts: Record<string, string> = {};
    if (query.date) parts.date = query.date;
    if (query.areaId) parts.areaId = query.areaId;
    if (query.merchantId) parts.merchantId = query.merchantId;
    if (query.role) parts.role = query.role;
    if (query.status) parts.status = query.status;
    if (query.category) parts.category = query.category;
    if (query.inventoryMin !== undefined) parts.inventoryMin = String(query.inventoryMin);
    if (query.inventoryMax !== undefined) parts.inventoryMax = String(query.inventoryMax);
    if (query.inventoryFlag) parts.inventoryFlag = query.inventoryFlag;
    return JSON.stringify(parts);
  }

  invalidateRecommendationCache(): void {
    this.recommendationCache.clear();
  }

  private async getCachedRecommendations(
    query: RecommendQuery
  ): Promise<{ date: string; areaId: string; packages: RecommendPackageItem[] }> {
    const cacheKey = this.recommendationCacheKey(query);
    const now = Date.now();
    const cached = this.recommendationCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.data;

    const inFlight = this.recommendationInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const pending = this.computeRecommendations(query)
      .then((data) => {
        this.pruneRecommendationCache(now);
        this.recommendationCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + this.recommendationCacheTtlMs
        });
        return data;
      })
      .finally(() => {
        this.recommendationInFlight.delete(cacheKey);
      });
    this.recommendationInFlight.set(cacheKey, pending);
    return pending;
  }

  async getRecommendations(query: RecommendQuery) {
    return this.getCachedRecommendations(query);
  }

  /** 从数据集中提取去重分类名（轻量端点，不触发评分管道） */
  async getCategories(query: { areaId?: string; role?: UserRole } = {}) {
    try {
      const dataset = await this.dataSource.loadDataset();
      let packages = dataset.packages;
      if (query.areaId) packages = packages.filter((pkg) => pkg.areaId === query.areaId);
      if (query.role === 'merchant_operator') {
        // merchant_operator 只能看到 selling 状态的包
        packages = packages.filter((pkg) => pkg.saleStatus === 'selling');
      }
      const categories = [...new Set(packages.map((pkg) => pkg.category).filter(Boolean))].sort();
      return { categories };
    } catch {
      return { categories: [] as string[] };
    }
  }

  // ==================== 核心推荐计算 ====================

  private async computeRecommendations(query: RecommendQuery) {
    const dataset = await this.dataSource.loadDataset();
    const asOf = this.resolveAsOfDate(query.date, dataset.snapshots);
    const snapshotsByPkg = latestSnapshotsByPackage(dataset.snapshots);
    const packages = this.applyRoleFilter(dataset.packages, query);
    // P2-5: 预过滤 category，避免对不匹配的包计算完整评分
    const preFiltered = query.category
      ? packages.filter((pkg) => pkg.category === query.category)
      : packages;
    const inventoryTrends = await this.loadJeesiteInventoryTrends(
      preFiltered.map((pkg) => pkg.packageId),
      dataset.snapshots,
      3,
      asOf
    );

    // 批量计算 —— promotion / inventory / score / tags / alerts 全部在内部完成 + 排序
    const built = buildRecommendPackageItems(preFiltered, snapshotsByPkg, inventoryTrends, asOf);

    const packagesWithScores = built
      .map((entry) => entry.item)
      .filter((item) => this.isSellingPackage(item))
      .filter((item) => query.inventoryMin == null || item.stockLeft >= query.inventoryMin)
      .filter((item) => query.inventoryMax == null || item.stockLeft <= query.inventoryMax)
      .filter((item) =>
        query.inventoryFlag === 'unsold' ? item.inventoryFlag !== 'normal' : true
      );

    return {
      date: query.date ?? localDateKey(new Date()),
      areaId: query.areaId ?? 'all',
      packages: packagesWithScores
    };
  }

  // ==================== 套餐分析 ====================

  async getPackageAnalysis(packageId: string) {
    const resolved = await this.resolveLocalPackageAndSnapshot(packageId);
    if (!resolved) throw new NotFoundException(`套餐不存在: ${packageId}`);

    const { pkg, snapshot, snapshots } = resolved;
    const asOf = this.resolveAsOfDate(undefined, [snapshot]);
    const inventoryTrends = await this.loadJeesiteInventoryTrends(
      [pkg.packageId],
      snapshots,
      3,
      asOf
    );

    // 复用批量计算 (N=1):与 getRecommendations 共享同一逻辑,避免 promotion/score/tags/alerts 二次计算
    const built = buildRecommendPackageItems(
      [pkg],
      new Map([[pkg.packageId, snapshot]]),
      inventoryTrends,
      asOf
    );
    // 走 batch 必有 1 个结果 (resolveLocalPackageAndSnapshot 已校验 snapshot 存在)
    const { item: recommendationItem, promotion } = built[0];
    const scoreBreakdown = recommendationItem.scoreBreakdown!;
    const operationTags = recommendationItem.operationTags!;
    const operationAlerts = recommendationItem.operationAlerts!;

    return this.buildPackageAnalysisResult({
      pkg,
      snapshot,
      promotion,
      recommendationItem,
      scoreBreakdown,
      operationTags,
      operationAlerts
    });
  }

  // ==================== AI 配置（委托给 AICopyService / DailyInventoryCrawlerService） ====================

  getAICopyStatus() {
    return this.aiCopyService.getStatus();
  }
  async updateAICopyConfig(config: AICopyConfigUpdate) {
    return this.aiCopyService.updateConfig(config);
  }
  crawlDailyInventory(date?: string) {
    return this.dailyInventoryCrawler.crawlDailyInventory(date);
  }

  // ==================== 社群 ====================

  async getCommunities(role?: UserRole) {
    const recommendations = await this.getRecommendations({ role, status: 'selling' });
    const cardMap = this.operationCardMap(recommendations.packages);
    return { items: buildDerivedCommunities(recommendations.packages, cardMap) };
  }

  async getCommunityRecommendations(groupId: string, role?: UserRole) {
    const communities = await this.getCommunities(role);
    const group = communities.items.find((item) => item.groupId === groupId);
    if (!group) throw new NotFoundException('社群不存在');
    return { group, packages: group.todayRecommendedPackages };
  }

  async generateBattleCard(packageId: string) {
    const recommendations = await this.getRecommendations({ status: 'selling' });
    const pkg = recommendations.packages.find((item) => item.packageId === packageId);
    if (!pkg?.scoreBreakdown) throw new NotFoundException(`套餐不存在: ${packageId}`);
    return buildBattleCard(pkg, pkg.scoreBreakdown, pkg.operationTags ?? []);
  }

  // ==================== 私有工具方法 ====================

  private resolveLocalPackageAndSnapshot(packageId: string) {
    return resolveFromSource(packageId, this.dataSource);
  }

  private operationCardMap = buildOperationCardMap;

  private pruneRecommendationCache(now: number) {
    if (this.recommendationCache.size < this.recommendationCacheMaxSize) return;

    for (const [key, entry] of this.recommendationCache.entries()) {
      if (entry.expiresAt <= now) this.recommendationCache.delete(key);
    }

    while (this.recommendationCache.size >= this.recommendationCacheMaxSize) {
      const firstKey = this.recommendationCache.keys().next().value;
      if (!firstKey) break;
      this.recommendationCache.delete(firstKey);
    }
  }

  private resolveAsOfDate(date: string | undefined, snapshots: SalesSnapshot[]) {
    if (date) {
      const parsed = new Date(`${date}T12:00:00.000`);
      if (Number.isFinite(parsed.getTime())) return parsed;
    }
    const latestSnapshot = snapshots
      .map((s) => new Date(s.snapshotTime))
      .filter((d) => Number.isFinite(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return latestSnapshot ?? new Date();
  }

  private buildLiveInventoryTrends(snapshots: SalesSnapshot[], days: number, asOf: Date) {
    const result = new Map<string, InventoryTrendPoint[]>();
    const dayEnd = new Date(asOf);
    dayEnd.setHours(23, 59, 59, 999);
    const dayStart = new Date(dayEnd);
    dayStart.setDate(dayStart.getDate() - Math.max(1, days) + 1);
    dayStart.setHours(0, 0, 0, 0);

    const latestByPkgAndDate = new Map<string, InventoryTrendPoint>();
    for (const snapshot of snapshots) {
      const snapshotDate = new Date(snapshot.snapshotTime);
      if (
        !Number.isFinite(snapshotDate.getTime()) ||
        snapshotDate < dayStart ||
        snapshotDate > dayEnd
      )
        continue;
      const date = localDateKey(snapshotDate);
      const key = `${snapshot.packageId}:${date}`;
      const point = {
        date,
        snapshotTime: snapshot.snapshotTime,
        remainingStock: Math.max(0, Math.round(snapshot.remainingStock))
      };
      const previous = latestByPkgAndDate.get(key);
      if (!previous || point.snapshotTime > previous.snapshotTime)
        latestByPkgAndDate.set(key, point);
    }
    for (const [key, point] of latestByPkgAndDate.entries()) {
      const packageId = key.split(':')[0];
      const points = result.get(packageId) ?? [];
      points.push(point);
      result.set(packageId, points);
    }
    for (const points of result.values()) points.sort(sortByDateKey((item) => item.date));
    return result;
  }

  private async loadJeesiteInventoryTrends(
    packageIds: string[],
    snapshots: SalesSnapshot[],
    days: number,
    asOf: Date
  ) {
    const crawledTrends = await this.dailyInventoryCrawler.loadRecentInventoryTrends(
      packageIds,
      days,
      asOf
    );
    const mergedTrends = this.dailyInventoryCrawler.mergeLiveSnapshots(
      crawledTrends,
      snapshots,
      asOf
    );
    const fallbackTrends = this.buildLiveInventoryTrends(snapshots, days, asOf);
    for (const [packageId, points] of fallbackTrends.entries()) {
      const existing = mergedTrends.get(packageId);
      if (!existing || existing.length === 0) mergedTrends.set(packageId, points);
    }
    return mergedTrends;
  }

  private applyRoleFilter(packages: ContentPackage[], query: RecommendQuery) {
    let result = packages;
    if (query.areaId) result = result.filter((pkg) => pkg.areaId === query.areaId);
    if (query.merchantId) result = result.filter((pkg) => pkg.merchantId === query.merchantId);
    if (query.role === 'area_operator' && !query.areaId) {
      this.logger.warn(
        'area_operator role without areaId — showing all packages. Select a specific area to filter.'
      );
    }
    if (query.role === 'merchant_operator' && !query.merchantId) {
      this.logger.warn(
        'merchant_operator role without merchantId — showing all packages. Select a specific merchant to filter.'
      );
    }
    return result;
  }

  private buildPackageAnalysisResult(params: {
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
    return {
      package: pkg,
      status: promotion.status,
      promotionScore: promotion.score,
      inventoryBacklogDays: recommendationItem.inventoryBacklogDays,
      inventoryFlag: recommendationItem.inventoryFlag,
      inventoryFlagLabel: recommendationItem.inventoryFlagLabel,
      inventoryFlagLevel: recommendationItem.inventoryFlagLevel,
      inventorySalesFlag: recommendationItem.inventorySalesFlag,
      inventorySalesLabel: recommendationItem.inventorySalesLabel,
      inventorySalesLevel: recommendationItem.inventorySalesLevel,
      inventoryObservedDays: recommendationItem.inventoryObservedDays,
      inventorySoldOutDays: recommendationItem.inventorySoldOutDays,
      inventoryUnsoldDays: recommendationItem.inventoryUnsoldDays,
      inventoryTrend: recommendationItem.inventoryTrend,
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
      trends: [
        { label: '曝光', value: snapshot.exposureCount },
        { label: '点击', value: snapshot.clickCount },
        { label: '下单', value: snapshot.orderCount },
        { label: '支付', value: snapshot.paidOrderCount },
        { label: '核销', value: snapshot.verifyCount },
        { label: '退款', value: snapshot.refundCount }
      ]
    };
  }

  private isSellingPackage(item: RecommendPackageItem) {
    if (item.saleStatus) return item.saleStatus === 'selling';
    return item.status !== 'pending_launch' && item.status !== 'sold_out';
  }
}
