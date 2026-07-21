import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { RecommendQuery, RecommendationResult, UserRole } from '@content/shared';
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
export class ContentService {
  private readonly runtime: ReturnType<typeof createRecommendationRuntime>;
  private readonly delegates: ReturnType<typeof createContentDelegates>;
  private readonly dataSource: DataSourceService;
  private readonly aiCopyService: AICopyService;
  private readonly dailyInventoryCrawler: DailyInventoryCrawlerService;

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
    this.runtime = createRecommendationRuntime((q) => this.delegates.computeRecommendations(q));
  }

  invalidateRecommendationCache() {
    return this.runtime.invalidate();
  }

  getRecommendations(query: RecommendQuery) {
    return this.runtime.getRecommendations(query);
  }

  getCategories(query: { areaId?: string; role?: UserRole } = {}) {
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
      const now = new Date().toISOString();
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
            "areaId"=excluded."areaId","areaName"=excluded."areaName",
            "category"=excluded."category","salePrice"=excluded."salePrice",
            "stockLeft"=excluded."stockLeft","saleStatus"=excluded."saleStatus",
            "shopId"=COALESCE(NULLIF(excluded."shopId",''),"ContentPackage"."shopId"),
            "merchantAddress"=excluded."merchantAddress",
            "updatedAt"=CURRENT_TIMESTAMP`,
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

  getCommunities(role?: UserRole) {
    return this.delegates.getCommunities(role);
  }

  getCommunityRecommendations(groupId: string, role?: UserRole) {
    return this.delegates.getCommunityRecommendations(groupId, role);
  }

  generateBattleCard(packageId: string) {
    return this.delegates.generateBattleCard(packageId);
  }
}
