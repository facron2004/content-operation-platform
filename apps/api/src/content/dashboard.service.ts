import { Inject, Injectable } from '@nestjs/common';
import type { RecommendPackageItem, UserRole } from '@content/shared';
import type { DashboardOpsScope, GetRecommendationsFn } from './dashboard-ops-support';
import { DashboardOperationsService } from './dashboard-operations.service';
import { DashboardSummaryService } from './dashboard-summary.service';

// Keep the existing module/controller entry point stable while dashboard work is
// split by responsibility. Controllers and existing consumers continue to use
// DashboardService; the domain services own their cache/query boundaries.
export { dashboardOpsCacheKey } from './dashboard-ops-support';
export type { DashboardOpsScope, GetRecommendationsFn } from './dashboard-ops-support';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DashboardOperationsService)
    private readonly operationsService: DashboardOperationsService,
    @Inject(DashboardSummaryService)
    private readonly summaryService: DashboardSummaryService
  ) {}

  invalidateCache(): void {
    this.operationsService.invalidateCache();
    this.summaryService.invalidateCache();
  }

  getTodayOperationConsole(
    role: UserRole | undefined,
    getRecommendations: GetRecommendationsFn,
    scope: DashboardOpsScope = {}
  ) {
    return this.operationsService.getTodayOperationConsole(role, getRecommendations, scope);
  }

  getDashboardSummary(
    getRecommendations: GetRecommendationsFn,
    options: { includePlatformCounters?: boolean } = {}
  ) {
    return this.summaryService.getDashboardSummary(getRecommendations, options);
  }

  getPerformance(getRecommendations: GetRecommendationsFn) {
    return this.operationsService.getPerformance(getRecommendations);
  }

  statusDistribution(packages: RecommendPackageItem[]): Record<string, number> {
    return this.summaryService.statusDistribution(packages);
  }
}
