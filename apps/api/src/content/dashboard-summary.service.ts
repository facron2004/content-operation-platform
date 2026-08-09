import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { RecommendPackageItem } from '@content/shared';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { safeRatio } from '../common/format';
import { INTERACTIVE_LIST_MAX_DAYS } from '../common/list-date-span';
import { RECOMMEND_CACHE_CAP } from '../common/sql-chunk';
import { beijingDayRangeSqlite, sqlDatetimeExclusiveRange } from '../common/sqlite-datetime';
import { PrismaService } from '../prisma/prisma.service';
import { DASHBOARD_OPS_TTL_MS, type GetRecommendationsFn } from './dashboard-ops-support';

@Injectable()
export class DashboardSummaryService {
  private readonly logger = new Logger(DashboardSummaryService.name);
  /** Summary aggregates are platform-wide and share the heavy-list cache bound. */
  private readonly opsCache = new TtlCache(DASHBOARD_OPS_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  invalidateCache(): void {
    this.opsCache.clear();
  }

  /**
   * Dashboard 摘要：文案数量、GMV、转化率、套餐状态分布。
   * 使用 SQL 聚合代替 findMany + 内存 reduce。
   * Platform counters (copy/GMV) are unrestricted-only; scoped callers pass
   * includePlatformCounters=false so we never full-scan cross-tenant tables.
   * Unrestricted COUNTs/SUM are short-TTL getOrLoad — home multi-tab cold hits
   * must not stampede GeneratedCopy/CopyPerformance indexes.
   */
  async getDashboardSummary(
    getRecommendations: GetRecommendationsFn,
    options: { includePlatformCounters?: boolean } = {}
  ) {
    const includePlatformCounters = options.includePlatformCounters !== false;
    if (includePlatformCounters) {
      // Platform counters are unrestricted-only — single key per day is intentional.
      // Distinct from ops:today / ops:performance keys (no role/scope fragments).
      const today = beijingDateKey(new Date());
      const key = `ops:summary|${today}`;
      try {
        return await this.opsCache.getOrLoad(key, false, () =>
          withHeavyAggregateGate(() => this.computeDashboardSummary(getRecommendations, true))
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
          throw new ConflictException('Dashboard 摘要计算繁忙，请稍后再试');
        }
        throw err;
      }
    }
    // Scoped path: no platform COUNTs; recommend is already scoped + cached upstream.
    // Do not share unrestricted summary payload with scoped callers.
    return this.computeDashboardSummary(getRecommendations, false);
  }

  private async computeDashboardSummary(
    getRecommendations: GetRecommendationsFn,
    includePlatformCounters: boolean
  ) {
    let generatedCount = 0;
    let approvedCount = 0;
    let pushedCount = 0;
    let pendingCount = 0;
    let riskCount = 0;
    let clickCount = 0;
    let orderCount = 0;
    let verifyCount = 0;
    let gmv = 0;

    // Residual #261: always emit interactive window bounds so SPA can label the
    // funnel honestly (was hard-coded「近 90 天」). Same INTERACTIVE_LIST_MAX_DAYS
    // used for COUNTs/SUM when platform counters run.
    const dateTo = beijingDateKey(new Date());
    const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));

    if (includePlatformCounters) {
      // Residual #125: single GROUP BY "auditStatus" (no N× count) + combined
      // CopyPerformance COUNT/SUM aggregate; both scoped to the trailing
      // INTERACTIVE_LIST_MAX_DAYS window via exclusive Beijing-day bounds.
      const { start: createdStart } = beijingDayRangeSqlite(dateFrom);
      const { end: createdEnd } = beijingDayRangeSqlite(dateTo);

      const [statusRows, perfRows] = await Promise.all([
        this.prisma.$queryRawUnsafe<Array<{ auditStatus: string; cnt: number | bigint }>>(
          `SELECT "auditStatus" AS auditStatus, COUNT(*) AS cnt
           FROM "GeneratedCopy"
           WHERE ${sqlDatetimeExclusiveRange('"createdAt"')}
           GROUP BY "auditStatus"`,
          createdStart,
          createdEnd
        ),
        this.prisma.$queryRawUnsafe<
          Array<{
            rowCount: number | bigint;
            exposureCount: number | bigint | null;
            clickCount: number | bigint | null;
            orderCount: number | bigint | null;
            verifyCount: number | bigint | null;
            gmvFen: number | bigint | null;
          }>
        >(
          `SELECT COUNT(*) as "rowCount",
                  COALESCE(SUM("exposureCount"), 0) as "exposureCount",
                  COALESCE(SUM("clickCount"), 0) as "clickCount",
                  COALESCE(SUM("orderCount"), 0) as "orderCount",
                  COALESCE(SUM("verifyCount"), 0) as "verifyCount",
                  COALESCE(SUM("gmvFen"), 0) as "gmvFen"
           FROM "CopyPerformance"
           WHERE ${sqlDatetimeExclusiveRange('"createdAt"')}`,
          createdStart,
          createdEnd
        )
      ]);

      const byStatus = new Map<string, number>();
      for (const r of statusRows) {
        byStatus.set(String(r.auditStatus), Number(r.cnt) || 0);
      }
      approvedCount = byStatus.get('approved') ?? 0;
      pendingCount = byStatus.get('pending') ?? 0;
      riskCount = byStatus.get('risk') ?? 0;
      generatedCount = 0;
      for (const n of byStatus.values()) generatedCount += n;

      const perf = perfRows[0];
      pushedCount = Number(perf?.rowCount ?? 0);
      clickCount = Number(perf?.clickCount ?? 0);
      orderCount = Number(perf?.orderCount ?? 0);
      verifyCount = Number(perf?.verifyCount ?? 0);
      gmv = Number(perf?.gmvFen ?? 0) / 100;
    }

    // 通过回调获取推荐数据(ContentService 内部已有缓存,无需再关心)
    const packagesSummary = {
      sellingCount: 0,
      sourceMatchedCount: 0,
      sourceLimit: RECOMMEND_CACHE_CAP,
      sourceTruncated: false,
      sourceError: undefined as string | undefined,
      countByStatus: {} as Record<string, number>,
      top5: [] as RecommendPackageItem[]
    };
    try {
      const recommendations = await getRecommendations({ status: 'selling' });
      const matched =
        typeof recommendations.matchedCount === 'number' &&
        Number.isFinite(recommendations.matchedCount)
          ? Math.max(0, Math.floor(recommendations.matchedCount))
          : recommendations.packages.length;
      packagesSummary.sellingCount = matched;
      packagesSummary.sourceMatchedCount = matched;
      packagesSummary.sourceTruncated = matched > recommendations.packages.length;
      packagesSummary.countByStatus = this.statusDistribution(recommendations.packages);
      packagesSummary.top5 = recommendations.packages.slice(0, 5);
    } catch {
      packagesSummary.sourceError = '推荐源暂不可用，状态分布和套餐榜单未加载';
      this.logger.warn('外部 API 不可用，dashboard 推荐源结果已标记为不可用');
    }

    return {
      generatedCount,
      approvedCount,
      pushedCount,
      pendingCount,
      riskCount,
      totalClickCount: clickCount,
      totalOrderCount: orderCount,
      totalVerifyCount: verifyCount,
      totalGmv: Number(gmv.toFixed(2)),
      contentConversionRate: safeRatio(orderCount, clickCount),
      verifyConversionRate: safeRatio(verifyCount, orderCount),
      // Residual #261: INTERACTIVE_LIST_MAX_DAYS window bounds (parity #256).
      dateFrom,
      dateTo,
      // Residual #291: status/top-package heads are derived from the capped
      // recommendation source, so the UI can distinguish a partial summary.
      sourceMatchedCount: packagesSummary.sourceMatchedCount,
      sourceLimit: packagesSummary.sourceLimit,
      sourceTruncated: packagesSummary.sourceTruncated,
      sourceError: packagesSummary.sourceError,
      statusDistribution: packagesSummary.countByStatus,
      topPackages: packagesSummary.top5,
      riskPackages:
        Object.entries(packagesSummary.countByStatus).filter(
          ([status]) => status === 'high_refund_risk'
        ).length > 0
          ? packagesSummary.top5.filter(
              (pkg) => pkg.status === 'high_refund_risk' || pkg.promotionLevel === 'D'
            )
          : []
    };
  }

  statusDistribution(packages: RecommendPackageItem[]): Record<string, number> {
    return packages.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
  }
}
