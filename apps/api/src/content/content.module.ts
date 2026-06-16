import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DashboardController } from './dashboard.controller';
import { AlertController } from './alert.controller';
import { CopyController } from './copy.controller';
import { PackageController } from './package.controller';
import { ContentService } from './content.service';
import { CopyService } from './copy.service';
import { AlertService } from './alert.service';
import { DashboardService } from './dashboard.service';
import { DataSourceService } from './data-source.service';
import { AutoLoginService } from './auto-login.service';
import { PackageDetailService } from './package-detail.service';
import { AICopyService } from './ai-copy.service';
import { DailyInventoryCrawlerService } from './daily-inventory-crawler.service';

@Module({
  imports: [ConfigModule],
  controllers: [DashboardController, AlertController, CopyController, PackageController],
  providers: [
    ContentService,
    CopyService,
    AlertService,
    DashboardService,
    DataSourceService,
    AutoLoginService,
    PackageDetailService,
    AICopyService,
    DailyInventoryCrawlerService
  ],
  exports: [ContentService, CopyService, AlertService, DashboardService]
})
export class ContentModule {}
