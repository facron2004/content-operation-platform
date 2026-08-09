import { NotFoundException } from '@nestjs/common';
import type {
  BattleCard,
  CommunityGroup,
  ContentPackage,
  OperationTag,
  PackageScoreBreakdown,
  RecommendPackageItem,
  RecommendQuery,
  RecommendationResult,
  UserRole
} from '@content/shared';
import { RECOMMEND_CACHE_CAP } from '../common/sql-chunk';
import { buildBattleCard, buildDerivedCommunities } from '../domain/operation-rules';
import type { DataSourceService } from './data-source.service';
import type { DailyInventoryCrawlerService } from './daily-inventory-crawler.service';
import type { PackageAnalysisResult } from './content-recommend-core';
import { createContentAnalysisDelegates } from './content-recommendation-facade';
import { buildOperationCardMap } from './package-detail-helpers';

export * from './content-recommendation-facade';

export type ContentScopeFilter = {
  areaId?: string;
  merchantId?: string;
  areaIds?: string[];
  merchantIds?: string[];
};

export function createContentCommunityDelegates(params: {
  getRecommendations: (query: RecommendQuery) => Promise<RecommendationResult>;
  getPackageAnalysis: (packageId: string) => Promise<PackageAnalysisResult | null>;
}) {
  return {
    getCommunities: (role?: UserRole, scope?: ContentScopeFilter) =>
      getContentCommunities(params.getRecommendations, role, scope),
    getCommunityRecommendations: (groupId: string, role?: UserRole, scope?: ContentScopeFilter) =>
      getContentCommunityRecommendations(
        (r) => getContentCommunities(params.getRecommendations, r, scope),
        groupId,
        role
      ),
    generateBattleCard: (packageId: string) =>
      generateContentBattleCard(params.getPackageAnalysis, packageId)
  };
}

export function createContentDelegates(params: {
  getRecommendations: (query: RecommendQuery) => Promise<RecommendationResult>;
  dataSource: DataSourceService;
  dailyInventoryCrawler: DailyInventoryCrawlerService;
  warn: (msg: string) => void;
}) {
  const analysis = createContentAnalysisDelegates(params);
  return {
    ...analysis,
    ...createContentCommunityDelegates({
      getRecommendations: params.getRecommendations,
      getPackageAnalysis: analysis.getPackageAnalysis
    })
  };
}

export function collectPackageCategories(
  packages: ContentPackage[],
  query: {
    areaId?: string;
    areaIds?: string[];
    merchantId?: string;
    merchantIds?: string[];
    role?: UserRole;
  } = {}
): { categories: string[] } {
  let filtered = packages;
  if (query.areaId) {
    filtered = filtered.filter((pkg) => pkg.areaId === query.areaId);
  } else if (query.areaIds?.length) {
    const allowed = new Set(query.areaIds);
    filtered = filtered.filter((pkg) => pkg.areaId != null && allowed.has(pkg.areaId));
  }
  if (query.merchantId) {
    filtered = filtered.filter((pkg) => pkg.merchantId === query.merchantId);
  } else if (query.merchantIds?.length) {
    const allowed = new Set(query.merchantIds);
    filtered = filtered.filter((pkg) => pkg.merchantId != null && allowed.has(pkg.merchantId));
  }
  if (query.role === 'merchant_operator') {
    filtered = filtered.filter((pkg) => pkg.saleStatus === 'selling');
  }
  const categories = [...new Set(filtered.map((pkg) => pkg.category).filter(Boolean))].sort();
  return { categories };
}

export async function loadContentCategories(
  dataSource: DataSourceService,
  query: {
    areaId?: string;
    areaIds?: string[];
    merchantId?: string;
    merchantIds?: string[];
    role?: UserRole;
  } = {}
) {
  try {
    const dataset = await dataSource.loadDataset();
    return collectPackageCategories(dataset.packages, query);
  } catch {
    return { categories: [] as string[] };
  }
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

/**
 * Cap packages fed into derived-community scoring.
 * Output is already capped at MAX_DERIVED_COMMUNITY_GROUPS; this bounds CPU/memory
 * when the selling catalog is large (JWT-scoped or unrestricted).
 */
export const MAX_DERIVED_COMMUNITY_INPUT_PACKAGES = 200;

export async function generateContentBattleCardFromAnalysis(
  getPackageAnalysis: (packageId: string) => Promise<PackageAnalysisResult | null>,
  packageId: string,
  buildBattleCardFn: (
    pkg: RecommendPackageItem,
    score: PackageScoreBreakdown,
    tags: OperationTag[]
  ) => BattleCard
) {
  // Single-package path — never scan the full selling catalog just to find one id.
  const analysis = await getPackageAnalysis(packageId);
  if (!analysis?.scoreBreakdown) throw new NotFoundException(`套餐不存在: ${packageId}`);
  // RecommendPackageItem is a ContentPackage + scoring fields; analysis already has both.
  const pkg = {
    ...analysis.package,
    status: analysis.status as RecommendPackageItem['status'],
    promotionLevel: analysis.scoreBreakdown.level,
    promotionScore: analysis.promotionScore,
    inventoryBacklogDays: analysis.inventoryBacklogDays,
    inventoryPriority: analysis.inventoryBacklogDays >= 3 ? 'backlog_3d' : 'normal',
    inventoryFlag: analysis.inventoryFlag as RecommendPackageItem['inventoryFlag'],
    inventoryFlagLabel: analysis.inventoryFlagLabel,
    inventoryFlagLevel: analysis.inventoryFlagLevel as RecommendPackageItem['inventoryFlagLevel'],
    inventorySalesFlag: analysis.inventorySalesFlag as RecommendPackageItem['inventorySalesFlag'],
    inventorySalesLabel: analysis.inventorySalesLabel,
    inventorySalesLevel:
      analysis.inventorySalesLevel as RecommendPackageItem['inventorySalesLevel'],
    inventoryObservedDays: analysis.inventoryObservedDays,
    inventorySoldOutDays: analysis.inventorySoldOutDays,
    inventoryUnsoldDays: analysis.inventoryUnsoldDays,
    inventoryTrend: analysis.inventoryTrend,
    recommendedStrategy: analysis.recommendation
      .strategy as RecommendPackageItem['recommendedStrategy'],
    reason: analysis.recommendation.reason,
    riskTips: analysis.recommendation.riskTips,
    recommendedChannels: analysis.recommendation.suggestedChannels,
    conversionRate:
      analysis.salesData.exposureCount > 0
        ? analysis.salesData.paidOrderCount / analysis.salesData.exposureCount
        : 0,
    verifyRate:
      analysis.salesData.paidOrderCount > 0
        ? analysis.salesData.verifyCount / analysis.salesData.paidOrderCount
        : 0,
    refundRate:
      analysis.salesData.paidOrderCount > 0
        ? analysis.salesData.refundCount / analysis.salesData.paidOrderCount
        : 0,
    operationTags: analysis.operationTags,
    scoreBreakdown: analysis.scoreBreakdown,
    operationAlerts: analysis.operationAlerts
  } satisfies RecommendPackageItem;
  return buildBattleCardFn(pkg, analysis.scoreBreakdown, analysis.operationTags ?? []);
}

export async function getContentCommunities(
  getRecommendations: (
    query: RecommendQuery
  ) => Promise<{ packages: RecommendPackageItem[]; matchedCount?: number }>,
  role?: UserRole,
  scope?: ContentScopeFilter
): Promise<{
  items: CommunityGroup[];
  // Residual #278: dual-cap honesty for derived communities.
  sourceMatchedCount: number;
  sourceLimit: number;
  sourceTruncated: boolean;
  inputLimit: number;
  inputLoaded: number;
  inputTruncated: boolean;
  // Residual #281: MAX_DERIVED_COMMUNITY_GROUPS output-cap honesty.
  groupMatched: number;
  groupLimit: number;
  groupTruncated: boolean;
}> {
  const recommendations = await getRecommendations({
    role,
    status: 'selling',
    areaId: scope?.areaId,
    merchantId: scope?.merchantId,
    areaIds: scope?.areaIds,
    merchantIds: scope?.merchantIds
  });
  const recommendPackages = recommendations.packages ?? [];
  // Residual #278: RECOMMEND_CACHE_CAP source honesty (parity #275/#277).
  const sourceLimit = RECOMMEND_CACHE_CAP;
  const sourceMatchedCount =
    typeof recommendations.matchedCount === 'number' &&
    Number.isFinite(recommendations.matchedCount)
      ? Math.max(0, Math.floor(recommendations.matchedCount))
      : recommendPackages.length;
  const sourceTruncated = sourceMatchedCount > recommendPackages.length;
  // Prefer highest-scored packages so the 12 derived groups stay representative
  // without scoring the entire selling catalog on every request.
  const ranked = [...recommendPackages].sort(
    (a, b) => (b.promotionScore ?? 0) - (a.promotionScore ?? 0)
  );
  // Residual #278: second clip — MAX_DERIVED_COMMUNITY_INPUT_PACKAGES head honesty.
  const inputLimit = MAX_DERIVED_COMMUNITY_INPUT_PACKAGES;
  const packages = ranked.slice(0, inputLimit);
  const inputLoaded = packages.length;
  const inputTruncated = ranked.length > packages.length;
  const cardMap = buildOperationCardMap(packages);
  const derived = buildDerivedCommunities(packages, cardMap);
  return {
    items: derived.items,
    sourceMatchedCount,
    sourceLimit,
    sourceTruncated,
    inputLimit,
    inputLoaded,
    inputTruncated,
    // Residual #281
    groupMatched: derived.groupMatched,
    groupLimit: derived.groupLimit,
    groupTruncated: derived.groupTruncated
  };
}

export async function getContentCommunityRecommendations(
  getCommunities: (role?: UserRole) => Promise<{ items: CommunityGroup[] }>,
  groupId: string,
  role?: UserRole
) {
  return loadCommunityGroup(getCommunities, groupId, role);
}

export async function generateContentBattleCard(
  getPackageAnalysis: (packageId: string) => Promise<PackageAnalysisResult | null>,
  packageId: string
) {
  return generateContentBattleCardFromAnalysis(getPackageAnalysis, packageId, buildBattleCard);
}
