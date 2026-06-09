import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AuditCopyRequest,
  AuditStatus,
  Channel,
  ContentPackage,
  GenerateCopyRequest,
  InventoryTrendPoint,
  OperationCard,
  OperationTag,
  PackageScoreBreakdown,
  RecommendPackageItem,
  SalesSnapshot,
  UserRole
} from '@content/shared';
import { buildPromotionScore } from '../domain/promotion-rules';
import {
  buildBattleCard,
  buildCommunityTasks,
  buildDerivedCommunities,
  buildOperationAlerts,
  buildOperationTags,
  buildPackageScore,
  toOperationCard
} from '../domain/operation-rules';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceService } from './data-source.service';
import { buildInventoryFlag } from './inventory-flags';
import { PackageDetailService } from './package-detail.service';
import { AICopyService, type AICopyConfigUpdate } from './ai-copy.service';
import { DailyInventoryCrawlerService } from './daily-inventory-crawler.service';
import { CopyService } from './copy.service';
import { AlertService } from './alert.service';
import { DashboardService } from './dashboard.service';
import { getFallbackDate, localDateKey, latestSnapshotsByPackage, resolvePackageAndSnapshot as resolveFromSource } from './shared-helpers';

interface RecommendQuery {
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
  operationAlerts: any[];
  recommendation: { strategy: string; reason: string; suggestedChannels: Channel[]; riskTips: string[]; copyAngles: string[] };
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
  private readonly recommendationInFlight = new Map<string, Promise<{ date: string; areaId: string; packages: RecommendPackageItem[] }>>();
  private readonly RECOMMENDATION_CACHE_TTL = parseInt(process.env.CONTENT_CACHE_TTL_MS ?? '60000', 10);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataSourceService) private readonly dataSource: DataSourceService,
    @Inject(PackageDetailService) private readonly packageDetailService: PackageDetailService,
    @Inject(AICopyService) private readonly aiCopyService: AICopyService,
    @Inject(DailyInventoryCrawlerService) private readonly dailyInventoryCrawler: DailyInventoryCrawlerService,
    @Inject(CopyService) private readonly copyService: CopyService,
    @Inject(AlertService) private readonly alertService: AlertService,
    @Inject(DashboardService) private readonly dashboardService: DashboardService,
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

  private async getCachedRecommendations(query: RecommendQuery): Promise<{ date: string; areaId: string; packages: RecommendPackageItem[] }> {
    const cacheKey = this.recommendationCacheKey(query);
    const now = Date.now();
    const cached = this.recommendationCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.data;

    const inFlight = this.recommendationInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const pending = this.computeRecommendations(query).then((data) => {
      this.recommendationCache.set(cacheKey, { data, expiresAt: Date.now() + this.RECOMMENDATION_CACHE_TTL });
      this.recommendationInFlight.delete(cacheKey);
      return data;
    }).catch((error) => {
      this.recommendationInFlight.delete(cacheKey);
      throw error;
    });
    this.recommendationInFlight.set(cacheKey, pending);
    return pending;
  }

  async getRecommendations(query: RecommendQuery) {
    return this.getCachedRecommendations(query);
  }

  /** 从缓存推荐结果中提取去重分类名（轻量端点，不调用外部 API） */
  async getCategories(query: { areaId?: string; role?: UserRole } = {}) {
    try {
      const recommendations = await this.getCachedRecommendations({ ...query, status: 'selling' });
      const categories = [...new Set(recommendations.packages.map((pkg) => pkg.category).filter(Boolean))].sort();
      return { categories };
    } catch {
      // 缓存未命中时返回空列表
      return { categories: [] as string[] };
    }
  }

  // ==================== 核心推荐计算 ====================

  private async computeRecommendations(query: RecommendQuery) {
    const dataset = await this.dataSource.loadDataset();
    const asOf = this.resolveAsOfDate(query.date, dataset.snapshots);
    const snapshotsByPkg = latestSnapshotsByPackage(dataset.snapshots);
    const packages = this.applyRoleFilter(dataset.packages, query);
    const inventoryTrends = await this.loadJeesiteInventoryTrends(
      packages.map((pkg) => pkg.packageId), dataset.snapshots, 3, asOf
    );

    const packagesWithScores = packages
      .map((pkg): RecommendPackageItem | null => {
        const snapshot = snapshotsByPkg.get(pkg.packageId);
        if (!snapshot) return null;
        const promotion = buildPromotionScore(pkg, snapshot, getFallbackDate());
        const inventoryBacklogDays = this.getInventoryBacklogDays(pkg, snapshot);
        const inventoryPriority: RecommendPackageItem['inventoryPriority'] =
          pkg.stockLeft > 0 && inventoryBacklogDays >= 3 ? 'backlog_3d' : 'normal';
        const inventory = buildInventoryFlag({
          currentStockLeft: pkg.stockLeft, saleStatus: pkg.saleStatus,
          trend: this.ensureTodayInTrend(inventoryTrends.get(pkg.packageId) ?? [], pkg.stockLeft, snapshot.snapshotTime)
        });
        const item: RecommendPackageItem = {
          ...pkg, status: promotion.status,
          promotionLevel: promotion.level, promotionScore: promotion.score,
          inventoryBacklogDays, inventoryPriority,
          inventoryFlag: inventory.inventoryFlag, inventoryFlagLabel: inventory.inventoryFlagLabel,
          inventoryFlagLevel: inventory.inventoryFlagLevel, inventorySalesFlag: inventory.inventorySalesFlag,
          inventorySalesLabel: inventory.inventorySalesLabel, inventorySalesLevel: inventory.inventorySalesLevel,
          inventoryObservedDays: inventory.inventoryObservedDays, inventorySoldOutDays: inventory.inventorySoldOutDays,
          inventoryUnsoldDays: inventory.inventoryUnsoldDays, inventoryTrend: inventory.inventoryTrend,
          recommendedStrategy: promotion.recommendedStrategy, reason: promotion.reason,
          riskTips: promotion.riskTips, recommendedChannels: promotion.recommendedChannels,
          conversionRate: snapshot.conversionRate, verifyRate: snapshot.verifyRate, refundRate: snapshot.refundRate
        };
        const scoreBreakdown = buildPackageScore(item, snapshot);
        const operationTags = buildOperationTags(item, scoreBreakdown, snapshot, asOf);
        const operationAlerts = buildOperationAlerts(item, scoreBreakdown, snapshot, asOf);
        return {
          ...item, promotionScore: scoreBreakdown.totalScore, promotionLevel: scoreBreakdown.level,
          scoreBreakdown, operationTags, operationAlerts
        } as RecommendPackageItem;
      })
      .filter((item): item is RecommendPackageItem => item !== null)
      .filter((item) => this.isSellingPackage(item))
      .filter((item) => (query.category ? item.category === query.category : true))
      .filter((item) => (query.inventoryMin !== undefined ? item.stockLeft >= query.inventoryMin : true))
      .filter((item) => (query.inventoryMax !== undefined ? item.stockLeft <= query.inventoryMax : true))
      .filter((item) => (query.inventoryFlag === 'unsold' ? item.inventoryFlag !== 'normal' : true))
      .sort((a, b) => {
        const inventoryDelta = this.inventoryPriorityRank(b.inventoryFlag) - this.inventoryPriorityRank(a.inventoryFlag);
        if (inventoryDelta !== 0) return inventoryDelta;
        const priorityDelta = Number(b.inventoryPriority === 'backlog_3d') - Number(a.inventoryPriority === 'backlog_3d');
        if (priorityDelta !== 0) return priorityDelta;
        if (b.stockLeft !== a.stockLeft) return b.stockLeft - a.stockLeft;
        if (b.inventoryBacklogDays !== a.inventoryBacklogDays) return b.inventoryBacklogDays - a.inventoryBacklogDays;
        return b.promotionScore - a.promotionScore;
      });

    return {
      date: query.date ?? new Date().toISOString().slice(0, 10),
      areaId: query.areaId ?? 'all',
      packages: packagesWithScores
    };
  }

  // ==================== 套餐分析 ====================

  async getPackageAnalysis(packageId: string) {
    const resolved = await this.resolveLocalPackageAndSnapshot(packageId);
    if (!resolved) throw new NotFoundException('套餐不存在');

    const { pkg, snapshot } = resolved;
    const promotion = buildPromotionScore(pkg, snapshot, getFallbackDate());
    const asOf = this.resolveAsOfDate(undefined, [snapshot]);
    const inventoryTrends = await this.loadJeesiteInventoryTrends([pkg.packageId], resolved.snapshots, 3, asOf);
    const inventory = buildInventoryFlag({
      currentStockLeft: pkg.stockLeft, saleStatus: pkg.saleStatus,
      trend: this.ensureTodayInTrend(inventoryTrends.get(pkg.packageId) ?? [], pkg.stockLeft, snapshot.snapshotTime)
    });
    const recommendationItem: RecommendPackageItem = {
      ...pkg, status: promotion.status,
      promotionLevel: promotion.level, promotionScore: promotion.score,
      inventoryBacklogDays: this.getInventoryBacklogDays(pkg, snapshot),
      inventoryPriority: pkg.stockLeft > 0 && this.getInventoryBacklogDays(pkg, snapshot) >= 3 ? 'backlog_3d' : 'normal',
      inventoryFlag: inventory.inventoryFlag, inventoryFlagLabel: inventory.inventoryFlagLabel,
      inventoryFlagLevel: inventory.inventoryFlagLevel, inventorySalesFlag: inventory.inventorySalesFlag,
      inventorySalesLabel: inventory.inventorySalesLabel, inventorySalesLevel: inventory.inventorySalesLevel,
      inventoryObservedDays: inventory.inventoryObservedDays, inventorySoldOutDays: inventory.inventorySoldOutDays,
      inventoryUnsoldDays: inventory.inventoryUnsoldDays, inventoryTrend: inventory.inventoryTrend,
      recommendedStrategy: promotion.recommendedStrategy, reason: promotion.reason,
      riskTips: promotion.riskTips, recommendedChannels: promotion.recommendedChannels,
      conversionRate: snapshot.conversionRate, verifyRate: snapshot.verifyRate, refundRate: snapshot.refundRate
    };
    const scoreBreakdown = buildPackageScore(recommendationItem, snapshot);
    const operationTags = buildOperationTags(recommendationItem, scoreBreakdown, snapshot, asOf);
    const operationAlerts = buildOperationAlerts(recommendationItem, scoreBreakdown, snapshot, asOf);

    return {
      package: pkg, status: promotion.status, promotionScore: promotion.score,
      inventoryBacklogDays: this.getInventoryBacklogDays(pkg, snapshot),
      inventoryFlag: inventory.inventoryFlag, inventoryFlagLabel: inventory.inventoryFlagLabel,
      inventoryFlagLevel: inventory.inventoryFlagLevel, inventorySalesFlag: inventory.inventorySalesFlag,
      inventorySalesLabel: inventory.inventorySalesLabel, inventorySalesLevel: inventory.inventorySalesLevel,
      inventoryObservedDays: inventory.inventoryObservedDays, inventorySoldOutDays: inventory.inventorySoldOutDays,
      inventoryUnsoldDays: inventory.inventoryUnsoldDays, inventoryTrend: inventory.inventoryTrend,
      salesData: snapshot, operationTags, scoreBreakdown, operationAlerts,
      recommendation: {
        strategy: promotion.recommendedStrategy, reason: promotion.reason,
        suggestedChannels: promotion.recommendedChannels,
        riskTips: promotion.riskTips, copyAngles: promotion.copyAngles
      },
      trends: [
        { label: '曝光', value: snapshot.exposureCount }, { label: '点击', value: snapshot.clickCount },
        { label: '下单', value: snapshot.orderCount }, { label: '支付', value: snapshot.paidOrderCount },
        { label: '核销', value: snapshot.verifyCount }, { label: '退款', value: snapshot.refundCount }
      ]
    };
  }

  // ==================== AI 配置（委托） ====================

  getAICopyStatus() { return this.aiCopyService.getStatus(); }
  updateAICopyConfig(config: AICopyConfigUpdate) { return this.aiCopyService.updateConfig(config); }
  crawlDailyInventory(date?: string) { return this.dailyInventoryCrawler.crawlDailyInventory(date); }

  // ==================== 文案（委托给 CopyService） ====================

  generateCopies(request: GenerateCopyRequest) { return this.copyService.generateCopies(request); }
  listCopies(filters: { auditStatus?: AuditStatus; channel?: Channel }) { return this.copyService.listCopies(filters); }
  auditCopy(contentId: string, request: AuditCopyRequest) { return this.copyService.auditCopy(contentId, request); }

  // ==================== 预警（委托给 AlertService） ====================

  getOperationAlerts(query: any) {
    return this.alertService.getOperationAlerts(query, (q) => this.getRecommendations(q));
  }
  resolveOperationAlert(alertId: string, resolvedBy?: string) {
    return this.alertService.resolveOperationAlert(alertId, resolvedBy);
  }
  resolveOperationAlerts(alertIds: string[], resolvedBy?: string) {
    return this.alertService.resolveOperationAlerts(alertIds, resolvedBy);
  }

  // ==================== 仪表盘（委托给 DashboardService） ====================

  getTodayOperationConsole(role?: UserRole) {
    return this.dashboardService.getTodayOperationConsole(role, (q) => this.getRecommendations(q));
  }
  getDashboardSummary() {
    return this.dashboardService.getDashboardSummary(
      (q) => this.getRecommendations(q),
      this.recommendationCache,
      (q) => this.recommendationCacheKey(q),
      (q) => this.getCachedRecommendations(q),
    );
  }
  getPerformance() {
    return this.dashboardService.getPerformance((q) => this.getCachedRecommendations(q));
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
    if (!pkg?.scoreBreakdown) throw new NotFoundException('套餐不存在');
    return buildBattleCard(pkg, pkg.scoreBreakdown, pkg.operationTags ?? []);
  }

  // ==================== 私有工具方法 ====================

  private operationCardMap(packages: RecommendPackageItem[]) {
    return new Map<string, OperationCard>(
      packages.filter((pkg) => pkg.scoreBreakdown)
        .map((pkg) => [pkg.packageId, toOperationCard(pkg, pkg.scoreBreakdown!, pkg.operationTags ?? [])])
    );
  }

  private async resolveLocalPackageAndSnapshot(packageId: string) {
    return resolveFromSource(packageId, this.dataSource);
  }

  private resolveAsOfDate(date: string | undefined, snapshots: SalesSnapshot[]) {
    if (date) {
      const parsed = new Date(`${date}T12:00:00.000`);
      if (Number.isFinite(parsed.getTime())) return parsed;
    }
    const latestSnapshot = snapshots.map((s) => new Date(s.snapshotTime))
      .filter((d) => Number.isFinite(d.getTime())).sort((a, b) => b.getTime() - a.getTime())[0];
    return latestSnapshot ?? new Date();
  }

  private buildLiveInventoryTrends(snapshots: SalesSnapshot[], days: number, asOf: Date) {
    const result = new Map<string, InventoryTrendPoint[]>();
    const dayEnd = new Date(asOf); dayEnd.setHours(23, 59, 59, 999);
    const dayStart = new Date(dayEnd); dayStart.setDate(dayStart.getDate() - Math.max(1, days) + 1); dayStart.setHours(0, 0, 0, 0);

    const latestByPkgAndDate = new Map<string, InventoryTrendPoint>();
    for (const snapshot of snapshots) {
      const snapshotDate = new Date(snapshot.snapshotTime);
      if (!Number.isFinite(snapshotDate.getTime()) || snapshotDate < dayStart || snapshotDate > dayEnd) continue;
      const date = localDateKey(snapshotDate);
      const key = `${snapshot.packageId}:${date}`;
      const point = { date, snapshotTime: snapshot.snapshotTime, remainingStock: Math.max(0, Math.round(snapshot.remainingStock)) };
      const previous = latestByPkgAndDate.get(key);
      if (!previous || point.snapshotTime > previous.snapshotTime) latestByPkgAndDate.set(key, point);
    }
    for (const [key, point] of latestByPkgAndDate.entries()) {
      const packageId = key.split(':')[0];
      const points = result.get(packageId) ?? [];
      points.push(point); result.set(packageId, points);
    }
    for (const points of result.values()) points.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }

  private async loadJeesiteInventoryTrends(packageIds: string[], snapshots: SalesSnapshot[], days: number, asOf: Date) {
    const crawledTrends = await this.dailyInventoryCrawler.loadRecentInventoryTrends(packageIds, days, asOf);
    const mergedTrends = this.dailyInventoryCrawler.mergeLiveSnapshots(crawledTrends, snapshots, asOf);
    const fallbackTrends = this.buildLiveInventoryTrends(snapshots, days, asOf);
    for (const [packageId, points] of fallbackTrends.entries()) {
      if (!mergedTrends.has(packageId) || (mergedTrends.get(packageId)?.length ?? 0) === 0) mergedTrends.set(packageId, points);
    }
    return mergedTrends;
  }

  private ensureTodayInTrend(trend: InventoryTrendPoint[], stockLeft: number, snapshotTime: string) {
    const snapshotDate = new Date(snapshotTime);
    const date = Number.isFinite(snapshotDate.getTime()) ? localDateKey(snapshotDate) : localDateKey(new Date());
    if (trend.some((point) => point.date === date)) return trend;
    return [...trend, { date, snapshotTime, remainingStock: stockLeft }];
  }

  private inventoryPriorityRank(flag: RecommendPackageItem['inventoryFlag']) {
    const ranks: Record<RecommendPackageItem['inventoryFlag'], number> = {
      normal: 0, unsold_today: 1, unsold_2d: 2, unsold_3d_slow: 3
    };
    return ranks[flag];
  }

  private applyRoleFilter(packages: ContentPackage[], query: RecommendQuery) {
    let result = packages;
    if (query.areaId) result = result.filter((pkg) => pkg.areaId === query.areaId);
    if (query.merchantId) result = result.filter((pkg) => pkg.merchantId === query.merchantId);
    // 不再使用硬编码的 A001/M001：区域/商家角色若未指定具体 ID，展示全部数据
    // 前端选择具体区域/商家后再由 query.areaId / query.merchantId 过滤
    if (query.role === 'area_operator' && !query.areaId) {
      this.logger.warn('area_operator role without areaId — showing all packages. Select a specific area to filter.');
    }
    if (query.role === 'merchant_operator' && !query.merchantId) {
      this.logger.warn('merchant_operator role without merchantId — showing all packages. Select a specific merchant to filter.');
    }
    return result;
  }

  private getInventoryBacklogDays(pkg: ContentPackage, snapshot: SalesSnapshot) {
    const start = new Date(pkg.startTime).getTime();
    const snap = new Date(snapshot.snapshotTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(snap) || snap <= start) return 0;
    return Math.floor((snap - start) / (24 * 60 * 60 * 1000));
  }

  private isSellingPackage(item: RecommendPackageItem) {
    if (item.saleStatus) return item.saleStatus === 'selling';
    return item.status !== 'pending_launch' && item.status !== 'sold_out';
  }
}
