import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { UserRole } from '@content/shared';
import { beijingDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from './alert.service';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import {
  computeTodayOperationConsole,
  type DashboardOperationsReadDeps
} from './dashboard-operations-read';
import { computePerformance } from './dashboard-performance-read';
import {
  DASHBOARD_OPS_TTL_MS,
  dashboardOpsCacheKey,
  type DashboardOpsScope,
  type GetRecommendationsFn
} from './dashboard-ops-support';

@Injectable()
export class DashboardOperationsService {
  /** Ops console payloads are fat (recommend cards + CP/GC) — lower maxSize. */
  private readonly opsCache = new TtlCache(DASHBOARD_OPS_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AlertService) private readonly alertService: AlertService
  ) {}

  invalidateCache(): void {
    this.opsCache.clear();
  }

  /**
   * 今日运营作战台：必推/风险/爆品/滞销/社群/预警/复盘
   * getRecommendations 通过参数注入避免循环依赖。
   * Short TTL + getOrLoad coalesces concurrent cold hits (recommend miss + chunked CP/GC).
   */
  async getTodayOperationConsole(
    role: UserRole | undefined,
    getRecommendations: GetRecommendationsFn,
    scope: DashboardOpsScope = {}
  ) {
    const today = beijingDateKey(new Date());
    const cacheKey = dashboardOpsCacheKey('today', today, role, scope);
    try {
      // Cache hits skip the gate; cold path (recommend + CP/GC chunks) shares heavy pool.
      return await this.opsCache.getOrLoad(cacheKey, false, () =>
        withHeavyAggregateGate(() => this.computeTodayOperationConsole(role, getRecommendations))
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('运营台计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  /**
   * 效果数据：文案性能、版本对比、AI 复盘。
   * 注意:performances/copies 只 fetch 一次,review 和 items 共用结果。
   * Defense-in-depth: even though the controller is unrestricted-only, still
   * bound CopyPerformance/GeneratedCopy to recommended packageIds so a future
   * scope relaxation cannot leak platform-wide conversion rows.
   */
  async getPerformance(getRecommendations: GetRecommendationsFn) {
    // Unrestricted-only endpoint — single platform key is intentional.
    const today = beijingDateKey(new Date());
    const cacheKey = dashboardOpsCacheKey('performance', today);
    try {
      return await this.opsCache.getOrLoad(cacheKey, false, () =>
        withHeavyAggregateGate(() => this.computePerformance(getRecommendations))
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('效果数据计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  private get readDeps(): DashboardOperationsReadDeps {
    return { prisma: this.prisma, alertService: this.alertService };
  }

  private computeTodayOperationConsole(
    role: UserRole | undefined,
    getRecommendations: GetRecommendationsFn
  ) {
    return computeTodayOperationConsole(this.readDeps, role, getRecommendations);
  }

  private computePerformance(getRecommendations: GetRecommendationsFn) {
    return computePerformance(this.readDeps, getRecommendations);
  }
}
