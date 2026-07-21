import { NotFoundException } from '@nestjs/common';
import type {
  BattleCard,
  CommunityGroup,
  ContentPackage,
  InventoryTrendPoint,
  OperationTag,
  PackageScoreBreakdown,
  RecommendPackageItem,
  RecommendQuery,
  RecommendationResult,
  SalesSnapshot,
  UserRole
} from '@content/shared';
import { latestSnapshotsByPackage, localDateKey } from '@content/shared';
import { buildBattleCard, buildDerivedCommunities } from '../domain/operation-rules';
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
import {
  buildOperationCardMap,
  resolvePackageAndSnapshot as resolveFromSource
} from './package-detail-helpers';

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

export function createContentCommunityDelegates(
  getRecommendations: (query: RecommendQuery) => Promise<RecommendationResult>
) {
  return {
    getCommunities: (role?: UserRole) => getContentCommunities(getRecommendations, role),
    getCommunityRecommendations: (groupId: string, role?: UserRole) =>
      getContentCommunityRecommendations(
        (r) => getContentCommunities(getRecommendations, r),
        groupId,
        role
      ),
    generateBattleCard: (packageId: string) =>
      generateContentBattleCard(getRecommendations, packageId)
  };
}

export function createContentDelegates(params: {
  getRecommendations: (query: RecommendQuery) => Promise<RecommendationResult>;
  dataSource: DataSourceService;
  dailyInventoryCrawler: DailyInventoryCrawlerService;
  warn: (msg: string) => void;
}) {
  return {
    ...createContentAnalysisDelegates(params),
    ...createContentCommunityDelegates(params.getRecommendations)
  };
}

export function collectPackageCategories(
  packages: ContentPackage[],
  query: { areaId?: string; role?: UserRole } = {}
): { categories: string[] } {
  let filtered = packages;
  if (query.areaId) filtered = filtered.filter((pkg) => pkg.areaId === query.areaId);
  if (query.role === 'merchant_operator') {
    filtered = filtered.filter((pkg) => pkg.saleStatus === 'selling');
  }
  const categories = [...new Set(filtered.map((pkg) => pkg.category).filter(Boolean))].sort();
  return { categories };
}

export async function loadContentCategories(
  dataSource: DataSourceService,
  query: { areaId?: string; role?: UserRole } = {}
) {
  try {
    const dataset = await dataSource.loadDataset();
    return collectPackageCategories(dataset.packages, query);
  } catch {
    return { categories: [] as string[] };
  }
}
export type InventoryTrendLoader = (
  packageIds: string[],
  snapshots: SalesSnapshot[],
  days: number,
  asOf: Date
) => Promise<Map<string, InventoryTrendPoint[]>>;

export async function computeContentRecommendations(params: {
  query: RecommendQuery;
  dataSource: DataSourceService;
  warn: (msg: string) => void;
  loadInventoryTrends: InventoryTrendLoader;
}): Promise<RecommendationPayload> {
  const dataset = await params.dataSource.loadDataset();
  const asOf = resolveAsOfDate(params.query.date, dataset.snapshots),
    snapshotsByPkg = latestSnapshotsByPackage(dataset.snapshots);
  const packages = applyRoleFilter(dataset.packages, params.query, params.warn);
  const preFiltered = params.query.category
    ? packages.filter((pkg) => pkg.category === params.query.category)
    : packages;
  const inventoryTrends = await params.loadInventoryTrends(
    preFiltered.map((pkg) => pkg.packageId),
    dataset.snapshots,
    3,
    asOf
  );
  const built = buildRecommendPackageItems(preFiltered, snapshotsByPkg, inventoryTrends, asOf);
  return {
    date: params.query.date ?? localDateKey(new Date()),
    areaId: params.query.areaId ?? 'all',
    packages: filterRecommendationItems(
      built.map((e) => e.item),
      params.query,
      isSellingPackage
    )
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
export async function loadCommunityGroup(
  getCommunities: (role?: UserRole) => Promise<{ items: CommunityGroup[] }>,
  groupId: string,
  role?: UserRole
) {
  const communities = await getCommunities(role);
  const group = communities.items.find((item) => item.groupId === groupId);
  if (!group) throw new NotFoundException('社群不存在');
  return { group, packages: group.todayRecommendedPackages };
}

export async function generateContentBattleCardFromPackages(
  getRecommendations: (query: {
    status: 'selling';
  }) => Promise<{ packages: RecommendPackageItem[] }>,
  packageId: string,
  buildBattleCardFn: (
    pkg: RecommendPackageItem,
    score: PackageScoreBreakdown,
    tags: OperationTag[]
  ) => BattleCard
) {
  const recommendations = await getRecommendations({ status: 'selling' });
  const pkg = recommendations.packages.find((item) => item.packageId === packageId);
  if (!pkg?.scoreBreakdown) throw new NotFoundException(`套餐不存在: ${packageId}`);
  return buildBattleCardFn(pkg, pkg.scoreBreakdown, pkg.operationTags ?? []);
}

export async function getContentCommunities(
  getRecommendations: (query: {
    role?: UserRole;
    status: 'selling';
  }) => Promise<{ packages: RecommendPackageItem[] }>,
  role?: UserRole
): Promise<{ items: CommunityGroup[] }> {
  const recommendations = await getRecommendations({ role, status: 'selling' });
  const cardMap = buildOperationCardMap(recommendations.packages);
  return { items: buildDerivedCommunities(recommendations.packages, cardMap) };
}

export async function getContentCommunityRecommendations(
  getCommunities: (role?: UserRole) => Promise<{ items: CommunityGroup[] }>,
  groupId: string,
  role?: UserRole
) {
  return loadCommunityGroup(getCommunities, groupId, role);
}

export async function generateContentBattleCard(
  getRecommendations: (query: {
    status: 'selling';
  }) => Promise<{ packages: RecommendPackageItem[] }>,
  packageId: string
) {
  return generateContentBattleCardFromPackages(getRecommendations, packageId, buildBattleCard);
}
