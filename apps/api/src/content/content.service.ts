import { toSqliteDateTime } from '../common/sqlite-datetime';
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
import { type PackageAnalysisResult } from './content-recommend-core';
import { PrismaService } from '../prisma/prisma.service';
import { upsertMerchants } from '../merchant/merchant-address-updater';
import { createContentDelegates, loadContentCategories } from './content-facade';
import { createRecommendationRuntime } from './content-recommendation-runtime';

export type { RecommendQuery, RecommendationResult, PackageAnalysisResult };

@Injectable()
export class ContentService implements OnModuleInit, OnModuleDestroy {
  private readonly runtime: ReturnType<typeof createRecommendationRuntime>;
  private readonly delegates: ReturnType<typeof createContentDelegates>;
  private readonly dataSource: DataSourceService;
  private readonly aiCopyService: AICopyService;
  private readonly dailyInventoryCrawler: DailyInventoryCrawlerService;
  /** Single-flight across sync-merchants (loadDataset + multi-batch package upsert). */
  private merchantSyncRunning = false;

  /** Background re-warm timer so the heavy recommend cache never goes cold under users. */
  private warmupTimer?: ReturnType<typeof setInterval>;
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
    const delay = Number.parseInt(process.env.CONTENT_WARMUP_DELAY_MS ?? '3000', 10);
    const interval = Number.parseInt(process.env.CONTENT_WARMUP_INTERVAL_MS ?? '240000', 10);
    setTimeout(() => {
      this.warmRecommendationCaches().catch((err) =>
        this.logger.warn(`Recommendation prewarm failed: ${String((err as Error)?.message ?? err)}`)
      );
    }, delay);
    if (interval > 0) {
      this.warmupTimer = setInterval(() => {
        this.warmRecommendationCaches().catch((err) =>
          this.logger.warn(
            `Recommendation rewarm failed: ${String((err as Error)?.message ?? err)}`
          )
        );
      }, interval);
    }
  }

  onModuleDestroy() {
    if (this.warmupTimer) clearInterval(this.warmupTimer);
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
    const logger = new Logger('ContentService');
    if (this.merchantSyncRunning) {
      logger.warn('Skipping merchant sync — previous run still in flight');
      return {
        upserted: 0,
        skipped: true as const,
        packagesCount: 0,
        packagesPersisted: 0,
        note: 'Merchant sync already running'
      };
    }
    this.merchantSyncRunning = true;
    try {
      return await this.syncMerchantsFromJeeSiteUnlocked(logger);
    } finally {
      this.merchantSyncRunning = false;
    }
  }

  private async syncMerchantsFromJeeSiteUnlocked(logger: Logger) {
    logger.log('Fetching JeeSite dataset with merchant addresses...');
    const dataset = await this.dataSource.loadDataset({ forceRefresh: true });
    const result = await upsertMerchants(this.prisma, dataset);

    // Also persist packages to ContentPackage table (with shopId)
    const BATCH = 100;
    let pkgCount = 0;
    const pkgs = dataset.packages.filter((p) => p.packageId && p.merchantId);
    for (let i = 0; i < pkgs.length; i += BATCH) {
      const batch = pkgs.slice(i, i + BATCH);
      const vc = batch
        .map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .join(',');
      const now = toSqliteDateTime();
      const params = batch.flatMap((p) => [
        p.packageId,
        p.packageName,
        p.packageType,
        p.merchantId,
        p.merchantName,
        p.areaId,
        p.areaName,
        p.category,
        p.originalPrice,
        p.salePrice,
        p.welfarePrice ?? null,
        p.commissionRate,
        p.grossProfit,
        p.stockTotal,
        p.stockLeft,
        p.startTime,
        p.endTime,
        JSON.stringify(p.useRules),
        JSON.stringify(p.sellingPoints),
        p.miniProgramPath,
        p.detailSummary ?? null,
        p.saleStatus ?? null,
        p.merchantCooperationScore,
        82,
        80,
        82,
        p.shopId ?? null,
        p.merchantAddress ?? null,
        null, // fallbackPackageId
        now
      ]);
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "ContentPackage" (
            "packageId","packageName","packageType","merchantId","merchantName",
            "areaId","areaName","category","originalPrice","salePrice",
            "welfarePrice","commissionRate","grossProfit","stockTotal","stockLeft",
            "startTime","endTime","useRules","sellingPoints",
            "miniProgramPath","detailSummary","saleStatus","merchantCooperationScore",
            "areaMatchScore","timeMatchScore","historyScore",
            "shopId","merchantAddress","fallbackPackageId","updatedAt"
          ) VALUES ${vc}
          ON CONFLICT("packageId") DO UPDATE SET
            "packageName"=excluded."packageName","merchantName"=excluded."merchantName",
            -- Freeze merchant + geography while any non-terminal DistributionTask
            -- still references this package. Attribution COALESCE prefers
            -- package.areaId; merchantId drives scope boards — Jeesite reclass
            -- must not retarget live money windows.
            "merchantId"=CASE
              WHEN EXISTS (
                SELECT 1 FROM "DistributionTask" t
                WHERE t."packageId" = "ContentPackage"."packageId"
                  AND t."status" NOT IN ('completed', 'cancelled', 'failed')
              ) THEN "ContentPackage"."merchantId"
              ELSE excluded."merchantId"
            END,
            "areaId"=CASE
              WHEN EXISTS (
                SELECT 1 FROM "DistributionTask" t
                WHERE t."packageId" = "ContentPackage"."packageId"
                  AND t."status" NOT IN ('completed', 'cancelled', 'failed')
              ) THEN "ContentPackage"."areaId"
              ELSE excluded."areaId"
            END,
            "areaName"=CASE
              WHEN EXISTS (
                SELECT 1 FROM "DistributionTask" t
                WHERE t."packageId" = "ContentPackage"."packageId"
                  AND t."status" NOT IN ('completed', 'cancelled', 'failed')
              ) THEN "ContentPackage"."areaName"
              ELSE excluded."areaName"
            END,
            "category"=excluded."category","salePrice"=excluded."salePrice",
            "stockLeft"=excluded."stockLeft","saleStatus"=excluded."saleStatus",
            "shopId"=COALESCE(NULLIF(excluded."shopId",''),"ContentPackage"."shopId"),
            "merchantAddress"=excluded."merchantAddress",
            "updatedAt"=excluded."updatedAt"`,
          ...params
        );
        pkgCount += batch.length;
      } catch (err: unknown) {
        logger.warn(
          `Package upsert batch error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    logger.log(
      `Merchant sync complete: ${result.upserted} merchants, ${pkgCount} packages upserted`
    );
    return { ...result, packagesCount: dataset.packages.length, packagesPersisted: pkgCount };
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
