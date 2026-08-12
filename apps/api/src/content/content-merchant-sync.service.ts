import { Inject, Injectable, Logger } from '@nestjs/common';
import { yuanToFen } from '@content/shared';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { upsertMerchants } from '../merchant/merchant-address-updater';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceService } from './data-source.service';

@Injectable()
export class ContentMerchantSyncService {
  private readonly logger = new Logger(ContentMerchantSyncService.name);
  /** Single-flight across sync-merchants (loadDataset + multi-batch package upsert). */
  private merchantSyncRunning = false;

  constructor(
    @Inject(DataSourceService) private readonly dataSource: DataSourceService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async syncMerchantsFromJeeSite() {
    if (this.merchantSyncRunning) {
      this.logger.warn('Skipping merchant sync — previous run still in flight');
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
      return await this.syncMerchantsFromJeeSiteUnlocked();
    } finally {
      this.merchantSyncRunning = false;
    }
  }

  private async syncMerchantsFromJeeSiteUnlocked() {
    this.logger.log('Fetching JeeSite dataset with merchant addresses...');
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
        yuanToFen(p.originalPrice),
        yuanToFen(p.salePrice),
        yuanToFen(p.welfarePrice ?? null),
        p.commissionRate,
        yuanToFen(p.grossProfit),
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
            "areaId","areaName","category",
            "originalPriceFen","salePriceFen",
            "welfarePriceFen","commissionRate",
            "grossProfitFen","stockTotal","stockLeft",
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
            "category"=excluded."category","salePriceFen"=excluded."salePriceFen",
            "stockTotal"=excluded."stockTotal",
            "stockLeft"=excluded."stockLeft","saleStatus"=excluded."saleStatus",
            "shopId"=COALESCE(NULLIF(excluded."shopId",''),"ContentPackage"."shopId"),
            "merchantAddress"=excluded."merchantAddress",
            "updatedAt"=excluded."updatedAt"`,
          ...params
        );
        pkgCount += batch.length;
      } catch (err: unknown) {
        this.logger.warn(
          `Package upsert batch error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    this.logger.log(
      `Merchant sync complete: ${result.upserted} merchants, ${pkgCount} packages upserted`
    );
    return { ...result, packagesCount: dataset.packages.length, packagesPersisted: pkgCount };
  }
}
