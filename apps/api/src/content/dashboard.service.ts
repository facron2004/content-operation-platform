import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Channel, RecommendPackageItem, UserRole } from '@content/shared';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import {
  buildCommunityTasks,
  buildDailyReview,
  buildDerivedCommunities
} from '../domain/operation-rules';
import { buildOperationCardMap } from './package-detail-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from './alert.service';
import { mapPerformance, PERF_LIST_SELECT } from './mappers';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { safeRatio, nowISO } from '../common/format';
import { INTERACTIVE_LIST_MAX_DAYS } from '../common/list-date-span';
import {
  DASHBOARD_COPY_PERF_TAKE,
  DASHBOARD_GENERATED_COPY_TAKE,
  QUERY_IN_CHUNKS_CONCURRENCY,
  RECOMMEND_CACHE_CAP,
  mapPool,
  queryInChunks
} from '../common/sql-chunk';
import { beijingDayRangeSqlite, sqlDatetimeExclusiveRange } from '../common/sqlite-datetime';
import type { RecommendQuery, RecommendationResult } from './content.service';

type GetRecommendationsFn = (q: RecommendQuery) => Promise<RecommendationResult>;

/** JWT data-scope fragment for ops cache keys (must not share across tenants). */
export type DashboardOpsScope = {
  areaId?: string;
  merchantId?: string;
  areaIds?: string[];
  merchantIds?: string[];
};

/**
 * Ops cache key. Role is included only when provided (affects recommend scoring).
 * Free-form roles are stripped at the controller (USER_ROLES whitelist) so the
 * key space cannot be polluted by arbitrary client strings.
 */
export function dashboardOpsCacheKey(
  kind: 'today' | 'performance',
  today: string,
  role?: string,
  scope: DashboardOpsScope = {}
): string {
  const areaIds = [...(scope.areaIds ?? [])].sort().join(',');
  const merchantIds = [...(scope.merchantIds ?? [])].sort().join(',');
  return [
    `ops:${kind}`,
    today,
    role ?? '',
    scope.areaId ?? '',
    scope.merchantId ?? '',
    areaIds,
    merchantIds
  ].join('|');
}

// Prisma 行类型:显式声明,跨方法共享,避免内联 (typeof copies)[number] 漂移
const COPY_SELECT = {
  contentId: true,
  title: true,
  copyVersion: true,
  scenario: true
} as const;
type CopyRow = Prisma.GeneratedCopyGetPayload<{ select: typeof COPY_SELECT }>;
type PerfRow = Prisma.CopyPerformanceGetPayload<{
  select: {
    contentId: true;
    channel: true;
    conversionRate: true;
    orderCount: true;
    groupId: true;
    createdAt: true;
  };
}>;
// getPerformance 路径下 mapPerformance 需要 PERF_LIST_SELECT 列（无 taskId / 关系）
type FullPerfRow = Prisma.CopyPerformanceGetPayload<{ select: typeof PERF_LIST_SELECT }>;

/**
 * Merge chunked dashboard rows into a global top-N.
 * Per-chunk `take` alone yields "top N per chunk", not global top N when
 * packageIds span multiple IN chunks — re-sort after flatten then slice once.
 */
function takeGlobalTopByCreatedAt<T extends { createdAt?: Date | string | null }>(
  rows: T[],
  take: number
): T[] {
  if (rows.length <= take) return rows;
  return [...rows]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt as Date | string).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt as Date | string).getTime() : 0;
      return tb - ta;
    })
    .slice(0, take);
}

/** Ops-today / performance redo chunked CP/GC even when recommend is warm — short TTL. */
const DASHBOARD_OPS_TTL_MS = 60_000;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  /** Ops console payloads are fat (recommend cards + CP/GC) — lower maxSize. */
  private readonly opsCache = new TtlCache(DASHBOARD_OPS_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AlertService) private readonly alertService: AlertService
  ) {}

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

  private async computeTodayOperationConsole(
    role: UserRole | undefined,
    getRecommendations: GetRecommendationsFn
  ) {
    const recommendations = await getRecommendations({ role, status: 'selling' });
    const packages = recommendations.packages;
    // packages is RECOMMEND_CACHE_CAP-capped; prefer matchedCount for the KPI tile.
    const sellingCount =
      typeof recommendations.matchedCount === 'number' &&
      Number.isFinite(recommendations.matchedCount)
        ? Math.max(0, Math.floor(recommendations.matchedCount))
        : packages.length;
    // Residual #275: source-cap honesty for risk/alert tiles built from capped head.
    const sourceLimit = RECOMMEND_CACHE_CAP;
    const sourceMatchedCount = sellingCount;
    const sourceTruncated = sourceMatchedCount > packages.length;
    const cardMap = this.operationCardMap(packages);
    const cards = Array.from(cardMap.values());
    // Scope performances/copies to packages already filtered by JWT data-scope.
    // Platform-wide findMany would leak cross-tenant conversion rates / titles.
    const packageIds = packages.map((p) => p.packageId).filter(Boolean);
    // Chunk packageId IN lists (recommend can return ~RECOMMEND_CACHE_CAP ids).
    // Per-chunk take is a bound only; re-sort + slice once for global top-N.
    // Cap concurrent CopyPerformance / GeneratedCopy multi-chunk scans (parity
    // data-analysis OH pool) — bare Promise.all of two queryInChunks storms SQLite
    // when recommend returns a large package set.
    const [performances, copies] = packageIds.length
      ? await this.loadDashboardPerfAndCopies<PerfRow>(packageIds, {
          perfSelect: {
            contentId: true,
            channel: true,
            conversionRate: true,
            orderCount: true,
            groupId: true,
            createdAt: true
          }
        })
      : [[], []];
    const copiesById = new Map<string, CopyRow>(copies.map((c: CopyRow) => [c.contentId, c]));
    const performanceRows = performances.map((p: PerfRow) => ({
      contentId: p.contentId,
      title: copiesById.get(p.contentId)?.title ?? '-',
      channel: p.channel as Channel,
      conversionRate: p.conversionRate,
      orderCount: p.orderCount,
      groupId: p.groupId
    }));
    // Residual #290: DASHBOARD_GENERATED_COPY_TAKE title-join honesty on ops
    // console (parity #286 performance path). Missing titles fall back to '-'
    // when the GeneratedCopy head is truncated relative to performance rows.
    const titleJoinLimit = DASHBOARD_GENERATED_COPY_TAKE;
    const titleJoinLoaded = copies.length;
    const titleJoinTruncated = titleJoinLoaded >= titleJoinLimit;
    const titleJoinMissed = performances.reduce(
      (n, p) => n + (copiesById.has(p.contentId) ? 0 : 1),
      0
    );
    const allAlerts = this.alertService.rankAlerts(
      packages.flatMap((pkg: RecommendPackageItem) => pkg.operationAlerts ?? [])
    );
    const resolvedMeta = await this.alertService.loadResolvedAlertIds(recommendations.date);
    const resolvedAlertIds = resolvedMeta.ids;
    const alerts = allAlerts.filter((alert) => !resolvedAlertIds.has(alert.alertId));

    const communities = buildDerivedCommunities(packages, cardMap).items;
    // Residual #280: count full community tasks before focus-panel slice.
    const communityTaskCandidates = buildCommunityTasks(communities);
    const review = buildDailyReview(this.yesterdayKey(), cards, performanceRows);

    const dangerAlerts = alerts.filter((a) => a.level === 'danger');
    const warningAlerts = alerts.filter((a) => a.level === 'warning');
    const dangerRiskIds = new Set(dangerAlerts.map((a) => a.packageId));
    const riskIds = new Set(alerts.filter((a) => a.level !== 'info').map((a) => a.packageId));

    // Residual #280: focus panels are Top-N previews; KPI tiles must use full
    // candidate cardinality so home-page counts do not freeze at the panel head.
    const FOCUS_PANEL_LIMIT = 8;
    const ALERT_PREVIEW_LIMIT = 30;

    const riskCandidates = cards
      .filter((c) => riskIds.has(c.packageId))
      .sort(
        (a, b) =>
          (dangerRiskIds.has(b.packageId) ? 1 : 0) - (dangerRiskIds.has(a.packageId) ? 1 : 0) ||
          b.score - a.score
      );
    const riskPackages = riskCandidates.slice(0, FOCUS_PANEL_LIMIT);
    const mustPushCandidates = cards
      .filter((c) => c.stockLeft > 0 && !dangerRiskIds.has(c.packageId))
      .sort((a, b) => b.score - a.score);
    const mustPushPool = mustPushCandidates.some((c) => c.score >= 70)
      ? mustPushCandidates.filter((c) => c.score >= 70)
      : mustPushCandidates.filter((c) => c.score >= 55);
    const mustPushPackages = mustPushPool.slice(0, FOCUS_PANEL_LIMIT);
    const hotCandidates = cards.filter((c) =>
      c.tags.some((tag) => tag.key === 'hot_restock_needed' || tag.key === 'price_advantage')
    );
    const hotOpportunities = hotCandidates.slice(0, FOCUS_PANEL_LIMIT);
    const slowCandidates = cards.filter((c) => c.tags.some((tag) => tag.key === 'continuous_slow'));
    const slowMovingPackages = slowCandidates.slice(0, FOCUS_PANEL_LIMIT);
    const communityTasks = communityTaskCandidates.slice(0, FOCUS_PANEL_LIMIT);
    const alertPreview = alerts.slice(0, ALERT_PREVIEW_LIMIT);

    const panelTruncated =
      mustPushPool.length > FOCUS_PANEL_LIMIT ||
      riskCandidates.length > FOCUS_PANEL_LIMIT ||
      hotCandidates.length > FOCUS_PANEL_LIMIT ||
      slowCandidates.length > FOCUS_PANEL_LIMIT ||
      communityTaskCandidates.length > FOCUS_PANEL_LIMIT;
    const alertsTruncated = alerts.length > ALERT_PREVIEW_LIMIT;

    return {
      date: recommendations.date,
      summary: {
        sellingCount,
        // Residual #280: full candidate counts (not panel head lengths).
        mustPushCount: mustPushPool.length,
        riskCount: riskCandidates.length,
        hotOpportunityCount: hotCandidates.length,
        slowMovingCount: slowCandidates.length,
        communityTaskCount: communityTaskCandidates.length,
        avgScore: cards.length
          ? Math.round(cards.reduce((sum, c) => sum + c.score, 0) / cards.length)
          : 0,
        dangerAlertCount: dangerAlerts.length,
        warningAlertCount: warningAlerts.length,
        activeAlertCount: alerts.length,
        resolvedAlertCount: allAlerts.length - alerts.length,
        updatedAt: nowISO(),
        dataSource: 'JeeSite',
        sellingOnly: true
      },
      mustPushPackages,
      riskPackages,
      hotOpportunities,
      slowMovingPackages,
      communityTasks,
      yesterdayReview: review,
      alerts: alertPreview,
      // Residual #275: recommend source-cap honesty for risk/alert undercount.
      sourceMatchedCount,
      sourceLimit,
      sourceTruncated,
      // Residual #274 projection on ops console (resolvedMeta already loaded).
      resolvedIdsLimit: resolvedMeta.limit,
      resolvedIdsLoaded: resolvedMeta.loaded,
      resolvedIdsTruncated: resolvedMeta.truncated,
      // Residual #280: focus-panel / alert-preview cap honesty.
      panelLimit: FOCUS_PANEL_LIMIT,
      panelTruncated,
      alertsLimit: ALERT_PREVIEW_LIMIT,
      alertsTruncated,
      // Residual #290: GeneratedCopy title-join head honesty (ops console).
      titleJoinLimit,
      titleJoinLoaded,
      titleJoinTruncated,
      titleJoinMissed
    };
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
            gmv: number | null;
          }>
        >(
          `SELECT COUNT(*) as "rowCount",
                  COALESCE(SUM("exposureCount"), 0) as "exposureCount",
                  COALESCE(SUM("clickCount"), 0) as "clickCount",
                  COALESCE(SUM("orderCount"), 0) as "orderCount",
                  COALESCE(SUM("verifyCount"), 0) as "verifyCount",
                  COALESCE(SUM("gmv"), 0) as "gmv"
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
      gmv = Number(perf?.gmv ?? 0);
    }

    // 通过回调获取推荐数据(ContentService 内部已有缓存,无需再关心)
    const packagesSummary = {
      sellingCount: 0,
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
      packagesSummary.countByStatus = this.statusDistribution(recommendations.packages);
      packagesSummary.top5 = recommendations.packages.slice(0, 5);
    } catch {
      this.logger.warn('外部 API 不可用，dashboard 使用兜底数据');
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

  private async computePerformance(getRecommendations: GetRecommendationsFn) {
    const recommendations = await getRecommendations({ status: 'selling' });
    const packages = recommendations.packages ?? [];
    // Residual #277: RECOMMEND_CACHE_CAP source-cap honesty (parity #275 alerts/dashboard).
    const sourceLimit = RECOMMEND_CACHE_CAP;
    const sourceMatchedCount =
      typeof recommendations.matchedCount === 'number' &&
      Number.isFinite(recommendations.matchedCount)
        ? Math.max(0, Math.floor(recommendations.matchedCount))
        : packages.length;
    const sourceTruncated = sourceMatchedCount > packages.length;
    const packageIds = packages.map((p) => p.packageId).filter(Boolean);
    // Chunk packageId IN lists (recommend can return ~RECOMMEND_CACHE_CAP ids).
    // Per-chunk take is a bound only; re-sort + slice once for global top-N.
    // Cap concurrent multi-chunk scans — see loadDashboardPerfAndCopies.
    const [performances, copies] = packageIds.length
      ? await this.loadDashboardPerfAndCopies<FullPerfRow>(packageIds, {
          // Explicit columns only — mapPerformance does not need taskId / relations.
          perfSelect: PERF_LIST_SELECT
        })
      : [[], []];
    const copiesById = new Map<string, CopyRow>(copies.map((c: CopyRow) => [c.contentId, c]));
    const performanceRows = performances.map((p: FullPerfRow) => ({
      contentId: p.contentId,
      title: copiesById.get(p.contentId)?.title ?? '-',
      channel: p.channel as Channel,
      conversionRate: p.conversionRate,
      orderCount: p.orderCount,
      groupId: p.groupId
    }));
    const cards = Array.from(this.operationCardMap(packages).values());
    const review = buildDailyReview(this.yesterdayKey(), cards, performanceRows);

    // Residual #284: DASHBOARD_COPY_PERF_TAKE global head honesty — items +
    // versionComparison share the same capped CopyPerformance take.
    const itemsLimit = DASHBOARD_COPY_PERF_TAKE;
    const itemsLoaded = performances.length;
    const itemsTruncated = itemsLoaded >= itemsLimit;

    // Residual #286: DASHBOARD_GENERATED_COPY_TAKE title-join honesty —
    // missing titles/versions fall back to '-' when the GeneratedCopy head
    // is truncated relative to the performance items being labeled.
    const titleJoinLimit = DASHBOARD_GENERATED_COPY_TAKE;
    const titleJoinLoaded = copies.length;
    const titleJoinTruncated = titleJoinLoaded >= titleJoinLimit;
    const titleJoinMissed = performances.reduce(
      (n, p) => n + (copiesById.has(p.contentId) ? 0 : 1),
      0
    );

    return {
      items: performances.map((p: FullPerfRow) => {
        const copy = copiesById.get(p.contentId);
        return {
          ...mapPerformance(p),
          copyVersion: copy?.copyVersion ?? '-',
          title: copy?.title ?? '-'
        };
      }),
      versionComparison: performances.map((p: FullPerfRow) => {
        const copy = copiesById.get(p.contentId);
        return {
          copyVersion: copy?.copyVersion ?? '-',
          titleDirection: copy?.scenario ?? '-',
          clickCount: p.clickCount,
          orderCount: p.orderCount,
          verifyCount: p.verifyCount,
          conversionRate: p.conversionRate
        };
      }),
      review,
      // Residual #277: RECOMMEND_CACHE_CAP source-cap honesty.
      sourceMatchedCount,
      sourceLimit,
      sourceTruncated,
      // Residual #284: CopyPerformance head honesty (items + charts).
      itemsLimit,
      itemsLoaded,
      itemsTruncated,
      // Residual #286: GeneratedCopy title-join head honesty.
      titleJoinLimit,
      titleJoinLoaded,
      titleJoinTruncated,
      titleJoinMissed
    };
  }

  statusDistribution(packages: RecommendPackageItem[]): Record<string, number> {
    return packages.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Load CopyPerformance + GeneratedCopy for a packageId set under mapPool.
   * Each leg is already queryInChunks-bounded; mapPool caps the two multi-chunk
   * scans from running unbounded in parallel (cold multi-tab ops console).
   */
  private async loadDashboardPerfAndCopies<TPerf>(
    packageIds: string[],
    opts: { perfSelect: Prisma.CopyPerformanceSelect }
  ): Promise<[TPerf[], CopyRow[]]> {
    const jobs: Array<() => Promise<unknown>> = [
      () =>
        queryInChunks(packageIds, (chunk) =>
          this.prisma.copyPerformance.findMany({
            where: { packageId: { in: chunk } },
            orderBy: { createdAt: 'desc' },
            take: DASHBOARD_COPY_PERF_TAKE,
            select: opts.perfSelect
          })
        ).then((rows) => takeGlobalTopByCreatedAt(rows, DASHBOARD_COPY_PERF_TAKE)),
      () =>
        queryInChunks(packageIds, (chunk) =>
          this.prisma.generatedCopy.findMany({
            where: { packageId: { in: chunk } },
            orderBy: { createdAt: 'desc' },
            take: DASHBOARD_GENERATED_COPY_TAKE,
            select: { ...COPY_SELECT, createdAt: true }
          })
        ).then((rows) => takeGlobalTopByCreatedAt(rows, DASHBOARD_GENERATED_COPY_TAKE))
    ];
    const parts = await mapPool(jobs, QUERY_IN_CHUNKS_CONCURRENCY, (job) => job());
    return [parts[0] as TPerf[], parts[1] as CopyRow[]];
  }

  private operationCardMap = buildOperationCardMap;

  private yesterdayKey(): string {
    // Business day is Beijing; "yesterday review" must not depend on process TZ.
    return shiftDateKey(beijingDateKey(new Date()), -1);
  }
}
