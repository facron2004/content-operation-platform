import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DashboardController } from './dashboard.controller';
import { AlertController } from './alert.controller';
import { CopyController } from './copy.controller';
import { PackageController } from './package.controller';
import { PackageDetailController } from './package-detail.controller';
import { PackageOperationsController } from './package-operations.controller';
import { SoldoutController } from './soldout.controller';
import { ContentService } from './content.service';
import { ContentMerchantSyncService } from './content-merchant-sync.service';
import { CopyService } from './copy.service';
import { CopyAuditService } from './copy-audit.service';
import { CopyGenerationService } from './copy-generation.service';
import { CopyQueryService } from './copy-query.service';
import { AlertService } from './alert.service';
import { DashboardService } from './dashboard.service';
import { DashboardOperationsService } from './dashboard-operations.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DataSourceService } from './data-source.service';
import { JeeSiteDataSourceClient } from './jeesite-data-source.client';
import { AutoLoginService } from './auto-login.service';
import { PackageDetailService } from './package-detail';
import { AICopyService } from './ai-copy';
import { DailyInventoryCrawlerService } from './daily-inventory-crawler.service';
import { SoldoutService } from './soldout.service';
import { RuleConfigController } from './rule-config.controller';
import { RuleConfigService } from './rule-config.service';
import { ExternalDataCacheInvalidationService } from './external-data-cache-invalidation.service';

@Module({
  imports: [ConfigModule],
  controllers: [
    DashboardController,
    AlertController,
    CopyController,
    PackageController,
    PackageDetailController,
    PackageOperationsController,
    SoldoutController,
    RuleConfigController
  ],
  providers: [
    ContentService,
    ContentMerchantSyncService,
    CopyAuditService,
    CopyGenerationService,
    CopyQueryService,
    CopyService,
    AlertService,
    DashboardOperationsService,
    DashboardSummaryService,
    DashboardService,
    DataSourceService,
    JeeSiteDataSourceClient,
    AutoLoginService,
    PackageDetailService,
    AICopyService,
    DailyInventoryCrawlerService,
    SoldoutService,
    RuleConfigService,
    ExternalDataCacheInvalidationService
  ],
  exports: [
    ContentService,
    CopyService,
    AlertService,
    DashboardService,
    SoldoutService,
    AutoLoginService
  ]
})
export class ContentModule {}
