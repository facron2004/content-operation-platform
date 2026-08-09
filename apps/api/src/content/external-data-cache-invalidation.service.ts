import { Inject, Injectable } from '@nestjs/common';
import { AlertService } from './alert.service';
import { ContentService } from './content.service';
import { DashboardService } from './dashboard.service';
import { DataSourceService } from './data-source.service';
import { PackageDetailService } from './package-detail';

/** Invalidates every API cache whose payload can depend on the external session. */
@Injectable()
export class ExternalDataCacheInvalidationService {
  constructor(
    @Inject(DataSourceService) private readonly dataSource: DataSourceService,
    @Inject(ContentService) private readonly contentService: ContentService,
    @Inject(AlertService) private readonly alertService: AlertService,
    @Inject(DashboardService) private readonly dashboardService: DashboardService,
    @Inject(PackageDetailService) private readonly packageDetailService: PackageDetailService
  ) {}

  invalidateExternalDataCaches(): void {
    this.dataSource.invalidateCache();
    this.contentService.invalidateRecommendationCache();
    this.alertService.invalidateAggregateCache();
    this.dashboardService.invalidateCache();
    this.packageDetailService.clearCache();
  }
}
