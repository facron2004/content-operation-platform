import type { Prisma } from '@prisma/client';
import type { Channel } from '@content/shared';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { buildDailyReview } from '../domain/operation-rules';
import type { PrismaService } from '../prisma/prisma.service';
import { buildOperationCardMap } from './package-detail-helpers';
import { mapPerformance, PERF_LIST_SELECT } from './mappers';
import {
  DASHBOARD_COPY_PERF_TAKE,
  DASHBOARD_GENERATED_COPY_TAKE,
  QUERY_IN_CHUNKS_CONCURRENCY,
  RECOMMEND_CACHE_CAP,
  mapPool,
  queryInChunks
} from '../common/sql-chunk';
import {
  COPY_SELECT,
  takeGlobalTopByCreatedAt,
  type CopyRow,
  type GetRecommendationsFn
} from './dashboard-ops-support';

type FullPerfRow = Prisma.CopyPerformanceGetPayload<{ select: typeof PERF_LIST_SELECT }>;

export type DashboardPerformanceReadDeps = {
  prisma: PrismaService;
};

/**
 * 效果数据读编排：文案性能、版本对比、AI 复盘共享同一批 CP/GC 查询结果。
 */
export async function computePerformance(
  deps: DashboardPerformanceReadDeps,
  getRecommendations: GetRecommendationsFn
) {
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
    ? await loadDashboardPerfAndCopies<FullPerfRow>(deps.prisma, packageIds, {
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
  const cards = Array.from(buildOperationCardMap(packages).values());
  const review = buildDailyReview(yesterdayKey(), cards, performanceRows);

  // Residual #284: DASHBOARD_COPY_PERF_TAKE global head honesty — items +
  // versionComparison share the same capped CopyPerformance take.
  const itemsLimit = DASHBOARD_COPY_PERF_TAKE;
  const itemsLoaded = performances.length;
  const itemsTruncated = itemsLoaded >= itemsLimit;

  // Residual #286: DASHBOARD_GENERATED_COPY_TAKE title-join head honesty —
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

/**
 * Load CopyPerformance + GeneratedCopy for a packageId set under mapPool.
 * Each leg is already queryInChunks-bounded; mapPool caps the two multi-chunk
 * scans from running unbounded in parallel (cold multi-tab ops console).
 */
export async function loadDashboardPerfAndCopies<TPerf>(
  prisma: PrismaService,
  packageIds: string[],
  opts: { perfSelect: Prisma.CopyPerformanceSelect }
): Promise<[TPerf[], CopyRow[]]> {
  const jobs: Array<() => Promise<unknown>> = [
    () =>
      queryInChunks(packageIds, (chunk) =>
        prisma.copyPerformance.findMany({
          where: { packageId: { in: chunk } },
          orderBy: { createdAt: 'desc' },
          take: DASHBOARD_COPY_PERF_TAKE,
          select: opts.perfSelect
        })
      ).then((rows) => takeGlobalTopByCreatedAt(rows, DASHBOARD_COPY_PERF_TAKE)),
    () =>
      queryInChunks(packageIds, (chunk) =>
        prisma.generatedCopy.findMany({
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

function yesterdayKey(): string {
  // Business day is Beijing; "yesterday review" must not depend on process TZ.
  return shiftDateKey(beijingDateKey(new Date()), -1);
}
