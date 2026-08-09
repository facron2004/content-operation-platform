import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy
} from '@nestjs/common';
import type { RecommendQuery, RecommendationResult, UserRole } from '@content/shared';
import { withHeavyAggregateGate } from '../common';
import { resolveScopedQuery, type ScopeBinding } from '../user-access/data-scope';
import { DataSourceService } from './data-source.service';
import { AICopyService, type AICopyConfigUpdate } from './ai-copy';
import { DailyInventoryCrawlerService } from './daily-inventory-crawler.service';
import { ContentMerchantSyncService } from './content-merchant-sync.service';
import { type PackageAnalysisResult } from './content-recommend-core';
import { PrismaService } from '../prisma/prisma.service';
import { createContentDelegates, loadContentCategories } from './content-facade';
import { createRecommendationRuntime } from './content-recommendation-runtime';
import { isDesktopRuntime } from '../config/runtime.config';

export type { RecommendQuery, RecommendationResult, PackageAnalysisResult };

@Injectable()
export class ContentService implements OnModuleInit, OnModuleDestroy {
  private readonly runtime: ReturnType<typeof createRecommendationRuntime>;
  private readonly delegates: ReturnType<typeof createContentDelegates>;
  private readonly dataSource: DataSourceService;
  private readonly aiCopyService: AICopyService;
  private readonly dailyInventoryCrawler: DailyInventoryCrawlerService;

  /** Background re-warm timer so the heavy recommend cache never goes cold under users. */
  private warmupTimer?: ReturnType<typeof setInterval>;
  private warmupStartTimer?: ReturnType<typeof setTimeout>;
  private warmupRunning = false;
  private readonly logger = new Logger(ContentService.name);
  private static readonly UNRESTRICTED_ROLES: UserRole[] = [
    'admin',
    'platform_operator',
    'auditor'
  ];

  constructor(
    @Inject(DataSourceService) dataSource: DataSourceService,
    @Inject(AICopyService) aiCopyService: AICopyService,
    @Inject(DailyInventoryCrawlerService) crawler: DailyInventoryCrawlerService,
    @Inject(ContentMerchantSyncService)
    private readonly merchantSyncService: ContentMerchantSyncService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {
    const logger = new Logger(ContentService.name);
    this.dataSource = dataSource;
    this.aiCopyService = aiCopyService;
    this.dailyInventoryCrawler = crawler;
    this.delegates = createContentDelegates({
      getRecommendations: (q) => this.getRecommendations(q),
      dataSource,
      dailyInventoryCrawler: crawler,
      warn: (msg) => logger.warn(msg)
    });
    // Cold recommend (dataset + inventory trends + score) shares process-wide
    // heavy pool; runtime cache/inFlight still short-circuit before the gate.
    this.runtime = createRecommendationRuntime((q) =>
      withHeavyAggregateGate(() => this.delegates.computeRecommendations(q))
    );
  }

  invalidateRecommendationCache() {
    return this.runtime.invalidate();
  }

  /**
   * Boot warm-up: pre-compute the heavy recommend cache in the background so the
   * first dashboard load hits a warm entry instead of blocking 30s+ on cold compute
   * (which often triggers JeeSite inventory fetches). Re-warms on an interval so the
   * cache stays hot all day. Never throws — failures are logged only.
   */
  onModuleInit() {
    if (isDesktopRuntime() && !process.env.EXTERNAL_API_BASE_URL?.trim()) {
      this.logger.log('桌面端未配置外部数据源，跳过推荐预热');
      return;
    }
    const delay = Number.parseInt(process.env.CONTENT_WARMUP_DELAY_MS ?? '3000', 10);
    const interval = Number.parseInt(process.env.CONTENT_WARMUP_INTERVAL_MS ?? '240000', 10);
    this.warmupStartTimer = setTimeout(() => {
      this.warmupStartTimer = undefined;
      void this.runRecommendationWarmup('Recommendation prewarm failed');
    }, delay);
    if (interval > 0) {
      this.warmupTimer = setInterval(() => {
        void this.runRecommendationWarmup('Recommendation rewarm failed');
      }, interval);
    }
  }

  onModuleDestroy() {
    if (this.warmupStartTimer) {
      clearTimeout(this.warmupStartTimer);
      this.warmupStartTimer = undefined;
    }
    if (this.warmupTimer) clearInterval(this.warmupTimer);
    this.warmupTimer = undefined;
  }

  private async runRecommendationWarmup(failurePrefix: string): Promise<void> {
    if (this.warmupRunning) return;
    this.warmupRunning = true;
    try {
      await this.warmRecommendationCaches();
    } catch (err) {
      this.logger.warn(`${failurePrefix}: ${String((err as Error)?.message ?? err)}`);
    } finally {
      this.warmupRunning = false;
    }
  }

  private async warmRecommendationCaches(): Promise<void> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // 1) Unrestricted platform roles — dashboard calls getRecommendations without scope.
    for (const role of ContentService.UNRESTRICTED_ROLES) {
      this.getRecommendations({ role, status: 'selling' }).catch((err) =>
        this.logger.warn(
          `Prewarm recommend failed (${role}): ${String((err as Error)?.message ?? err)}`
        )
      );
      await sleep(800);
    }
    // 2) Scoped operators — mirror scopedRecommend's key (areaIds/merchantIds from bindings).
    try {
      const users = await this.prisma.appUser.findMany({
        where: { isActive: 1 },
        include: { bindings: true }
      });
      for (const u of users) {
        const roles = Array.from(new Set(u.bindings.map((b) => b.role))) as UserRole[];
        if (roles.length === 0) continue;
        const actor: { roles: string[]; bindings: ScopeBinding[] } = {
          roles,
          bindings: u.bindings.map((b) => ({
            role: b.role,
            scopeType: b.scopeType,
            scopeId: b.scopeId
          }))
        };
        const scoped = resolveScopedQuery(actor, {});
        if (scoped.emptyScope) continue; // deny-all → dashboard returns empty without compute
        for (const role of roles) {
          this.getRecommendations({
            role,
            status: 'selling',
            areaId: scoped.areaId,
            merchantId: scoped.merchantId,
            areaIds: scoped.areaIds,
            merchantIds: scoped.merchantIds
          }).catch((err) =>
            this.logger.warn(
              `Prewarm recommend failed (${role} scoped): ${String((err as Error)?.message ?? err)}`
            )
          );
          await sleep(800);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Recommendation prewarm (scoped) skipped: ${String((err as Error)?.message ?? err)}`
      );
    }
  }

  async getRecommendations(query: RecommendQuery) {
    try {
      return await this.runtime.getRecommendations(query);
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('推荐计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  getCategories(
    query: {
      areaId?: string;
      areaIds?: string[];
      merchantId?: string;
      merchantIds?: string[];
      role?: UserRole;
    } = {}
  ) {
    return loadContentCategories(this.dataSource, query);
  }

  async getPackageAnalysis(packageId: string) {
    const result = await this.delegates.getPackageAnalysis(packageId);
    if (!result) throw new NotFoundException(`套餐不存在: ${packageId}`);
    return result;
  }

  getAICopyStatus() {
    return this.aiCopyService.getStatus();
  }

  updateAICopyConfig(config: AICopyConfigUpdate) {
    return this.aiCopyService.updateConfig(config);
  }

  crawlDailyInventory(date?: string) {
    return this.dailyInventoryCrawler.crawlDailyInventory(date);
  }

  async syncMerchantsFromJeeSite() {
    return this.merchantSyncService.syncMerchantsFromJeeSite();
  }

  getCommunities(
    role?: UserRole,
    scope?: { areaId?: string; merchantId?: string; areaIds?: string[]; merchantIds?: string[] }
  ) {
    return this.delegates.getCommunities(role, scope);
  }

  getCommunityRecommendations(
    groupId: string,
    role?: UserRole,
    scope?: { areaId?: string; merchantId?: string; areaIds?: string[]; merchantIds?: string[] }
  ) {
    return this.delegates.getCommunityRecommendations(groupId, role, scope);
  }

  generateBattleCard(packageId: string) {
    return this.delegates.generateBattleCard(packageId);
  }
}
