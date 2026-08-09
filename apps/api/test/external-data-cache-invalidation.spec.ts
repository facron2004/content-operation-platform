import { describe, expect, it, vi } from 'vitest';
import { AlertService } from '../src/content/alert.service';
import { ContentService } from '../src/content/content.service';
import { DashboardService } from '../src/content/dashboard.service';
import { DataSourceService } from '../src/content/data-source.service';
import { ExternalDataCacheInvalidationService } from '../src/content/external-data-cache-invalidation.service';
import { PackageDetailService } from '../src/content/package-detail';

describe('ExternalDataCacheInvalidationService', () => {
  it('invalidates every cache backed by the external session', () => {
    const dataSource = { invalidateCache: vi.fn() } as unknown as DataSourceService;
    const contentService = {
      invalidateRecommendationCache: vi.fn()
    } as unknown as ContentService;
    const alertService = { invalidateAggregateCache: vi.fn() } as unknown as AlertService;
    const dashboardService = { invalidateCache: vi.fn() } as unknown as DashboardService;
    const packageDetailService = { clearCache: vi.fn() } as unknown as PackageDetailService;
    const service = new ExternalDataCacheInvalidationService(
      dataSource,
      contentService,
      alertService,
      dashboardService,
      packageDetailService
    );

    service.invalidateExternalDataCaches();

    expect(dataSource.invalidateCache).toHaveBeenCalledOnce();
    expect(contentService.invalidateRecommendationCache).toHaveBeenCalledOnce();
    expect(alertService.invalidateAggregateCache).toHaveBeenCalledOnce();
    expect(dashboardService.invalidateCache).toHaveBeenCalledOnce();
    expect(packageDetailService.clearCache).toHaveBeenCalledOnce();
  });
});
