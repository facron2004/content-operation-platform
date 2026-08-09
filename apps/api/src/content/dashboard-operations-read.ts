import type { Prisma } from '@prisma/client';
import type { Channel, RecommendPackageItem, UserRole } from '@content/shared';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import {
  buildCommunityTasks,
  buildDailyReview,
  buildDerivedCommunities
} from '../domain/operation-rules';
import type { PrismaService } from '../prisma/prisma.service';
import { buildOperationCardMap } from './package-detail-helpers';
import type { AlertService } from './alert.service';
import { DASHBOARD_GENERATED_COPY_TAKE, RECOMMEND_CACHE_CAP } from '../common/sql-chunk';
import { loadDashboardPerfAndCopies } from './dashboard-performance-read';
import { type CopyRow, type GetRecommendationsFn } from './dashboard-ops-support';

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

export type DashboardOperationsReadDeps = {
  prisma: PrismaService;
  alertService: Pick<AlertService, 'rankAlerts' | 'loadResolvedAlertIds'>;
};

/**
 * 今日运营作战台的重型读编排：查询已由推荐结果限定的数据，再投影面板和
 * source/panel/title-join 的截断诚实度元数据。
 */
export async function computeTodayOperationConsole(
  deps: DashboardOperationsReadDeps,
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
  const cardMap = buildOperationCardMap(packages);
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
    ? await loadDashboardPerfAndCopies<PerfRow>(deps.prisma, packageIds, {
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
  const allAlerts = deps.alertService.rankAlerts(
    packages.flatMap((pkg: RecommendPackageItem) => pkg.operationAlerts ?? [])
  );
  const resolvedMeta = await deps.alertService.loadResolvedAlertIds(recommendations.date);
  const resolvedAlertIds = resolvedMeta.ids;
  const alerts = allAlerts.filter((alert) => !resolvedAlertIds.has(alert.alertId));

  const communities = buildDerivedCommunities(packages, cardMap).items;
  // Residual #280: count full community tasks before focus-panel slice.
  const communityTaskCandidates = buildCommunityTasks(communities);
  const review = buildDailyReview(yesterdayKey(), cards, performanceRows);

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
      updatedAt: new Date().toISOString(),
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

function yesterdayKey(): string {
  // Business day is Beijing; "yesterday review" must not depend on process TZ.
  return shiftDateKey(beijingDateKey(new Date()), -1);
}

// Compatibility exports for callers that still import the historical module.
export { computePerformance, loadDashboardPerfAndCopies } from './dashboard-performance-read';
