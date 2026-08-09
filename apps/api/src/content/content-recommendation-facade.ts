import type {
  ContentPackage,
  InventoryTrendPoint,
  RecommendQuery,
  SalesSnapshot
} from '@content/shared';
import { beijingDateKey, latestSnapshotsByPackage } from '@content/shared';
import { RECOMMEND_CACHE_CAP, RECOMMEND_SCORE_CAP } from '../common/sql-chunk';
import type { DataSourceService } from './data-source.service';
import type { DailyInventoryCrawlerService } from './daily-inventory-crawler.service';
import {
  applyRoleFilter,
  buildLiveInventoryTrends,
  buildPackageAnalysisResult,
  buildRecommendPackageItems,
  isSellingPackage,
  resolveAsOfDate,
  type PackageAnalysisResult
} from './content-recommend-core';
import {
  filterRecommendationItems,
  type RecommendationPayload
} from './content-recommendation-runtime';
import { resolvePackageAndSnapshot as resolveFromSource } from './package-detail-helpers';

export async function loadMergedInventoryTrends(
  crawler: DailyInventoryCrawlerService,
  packageIds: string[],
  snapshots: SalesSnapshot[],
  days: number,
  asOf: Date
): Promise<Map<string, InventoryTrendPoint[]>> {
  const crawledTrends = await crawler.loadRecentInventoryTrends(packageIds, days, asOf);
  const mergedTrends = crawler.mergeLiveSnapshots(crawledTrends, snapshots, asOf);
  const fallbackTrends = buildLiveInventoryTrends(snapshots, days, asOf);
  for (const [packageId, points] of fallbackTrends.entries()) {
    const existing = mergedTrends.get(packageId);
    if (!existing || existing.length === 0) mergedTrends.set(packageId, points);
  }
  return mergedTrends;
}

export type InventoryTrendLoader = (
  packageIds: string[],
  snapshots: SalesSnapshot[],
  days: number,
  asOf: Date
) => Promise<Map<string, InventoryTrendPoint[]>>;

export function createContentAnalysisDelegates(params: {
  dataSource: DataSourceService;
  dailyInventoryCrawler: DailyInventoryCrawlerService;
  warn: (msg: string) => void;
}) {
  const loadInventoryTrends = (
    packageIds: string[],
    snapshots: SalesSnapshot[],
    days: number,
    asOf: Date
  ) => loadMergedInventoryTrends(params.dailyInventoryCrawler, packageIds, snapshots, days, asOf);

  return {
    computeRecommendations: (query: RecommendQuery) =>
      computeContentRecommendations({
        query,
        dataSource: params.dataSource,
        warn: params.warn,
        loadInventoryTrends
      }),
    getPackageAnalysis: (packageId: string) =>
      analyzeContentPackage({
        packageId,
        dataSource: params.dataSource,
        loadInventoryTrends
      })
  };
}

/**
 * Drop packages that cannot survive `filterRecommendationItems` before the
 * expensive inventory-trend + score pass. Mirrors selling/stock filters only —
 * inventoryFlag still needs trends and is applied after build.
 */
export function prefilterPackagesForRecommend(
  packages: ContentPackage[],
  query: RecommendQuery
): ContentPackage[] {
  let result = packages;
  if (query.category) {
    result = result.filter((pkg) => pkg.category === query.category);
  }
  // filterRecommendationItems always keeps selling packages; skip known non-sellers early.
  result = result.filter((pkg) => {
    if (pkg.saleStatus) return pkg.saleStatus === 'selling';
    return true;
  });
  if (query.inventoryMin != null) {
    const min = query.inventoryMin;
    result = result.filter((pkg) => pkg.stockLeft >= min);
  }
  if (query.inventoryMax != null) {
    const max = query.inventoryMax;
    result = result.filter((pkg) => pkg.stockLeft <= max);
  }
  return result;
}

export async function computeContentRecommendations(params: {
  query: RecommendQuery;
  dataSource: DataSourceService;
  warn: (msg: string) => void;
  loadInventoryTrends: InventoryTrendLoader;
}): Promise<RecommendationPayload> {
  const dataset = await params.dataSource.loadDataset();
  const asOf = resolveAsOfDate(params.query.date, dataset.snapshots),
    snapshotsByPkg = latestSnapshotsByPackage(dataset.snapshots);
  const scopedPackages = applyRoleFilter(dataset.packages, params.query, params.warn);
  // Pre-filter before inventory load — page flips share the runtime cache, but
  // cold path (alerts + first recommend) must not score the full catalog.
  const preFiltered = prefilterPackagesForRecommend(scopedPackages, params.query);
  // Hard cap scoring set: prefer higher stockLeft (backlog candidates) then stable id.
  const toScore =
    preFiltered.length <= RECOMMEND_SCORE_CAP
      ? preFiltered
      : [...preFiltered]
          .sort(
            (a, b) =>
              b.stockLeft - a.stockLeft || String(a.packageId).localeCompare(String(b.packageId))
          )
          .slice(0, RECOMMEND_SCORE_CAP);
  if (toScore.length < preFiltered.length) {
    params.warn(
      `Recommend cold path capped ${preFiltered.length} → ${toScore.length} packages (RECOMMEND_SCORE_CAP)`
    );
  }
  const inventoryTrends = await params.loadInventoryTrends(
    toScore.map((pkg) => pkg.packageId),
    dataset.snapshots,
    3,
    asOf
  );
  const built = buildRecommendPackageItems(toScore, snapshotsByPkg, inventoryTrends, asOf);
  // buildRecommendPackageItems already sorts by promotion score; filter preserves order.
  const filtered = filterRecommendationItems(
    built.map((e) => e.item),
    params.query,
    isSellingPackage
  );
  // Bound cached/HTTP-materialized ranked set below SCORE_CAP so multi-key warm
  // caches + dashboard/alerts do not retain full 2k-item arrays per key.
  const ranked =
    filtered.length <= RECOMMEND_CACHE_CAP ? filtered : filtered.slice(0, RECOMMEND_CACHE_CAP);
  if (ranked.length < filtered.length) {
    params.warn(
      `Recommend response capped ${filtered.length} → ${ranked.length} packages (RECOMMEND_CACHE_CAP)`
    );
  }
  // matchedCount = pre-score selling set (role/category/saleStatus/inventory bounds).
  // packages is SCORE+CACHE capped for payload; KPIs must not use packages.length.
  return {
    date: params.query.date ?? beijingDateKey(new Date()),
    areaId: params.query.areaId ?? 'all',
    packages: ranked,
    matchedCount: preFiltered.length
  };
}

export async function analyzeContentPackage(params: {
  packageId: string;
  dataSource: DataSourceService;
  loadInventoryTrends: InventoryTrendLoader;
}): Promise<PackageAnalysisResult | null> {
  const resolved = await resolveFromSource(params.packageId, params.dataSource);
  if (!resolved) return null;
  const { pkg, snapshot, snapshots } = resolved;
  const asOf = resolveAsOfDate(undefined, [snapshot]);
  const inventoryTrends = await params.loadInventoryTrends([pkg.packageId], snapshots, 3, asOf);
  const built = buildRecommendPackageItems(
    [pkg],
    new Map([[pkg.packageId, snapshot]]),
    inventoryTrends,
    asOf
  );
  const { item: recommendationItem, promotion } = built[0];
  return buildPackageAnalysisResult({
    pkg,
    snapshot,
    promotion,
    recommendationItem,
    scoreBreakdown: recommendationItem.scoreBreakdown!,
    operationTags: recommendationItem.operationTags!,
    operationAlerts: recommendationItem.operationAlerts!
  });
}
