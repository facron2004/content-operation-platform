import type {
  Channel,
  ContentPackage,
  InventoryTrendPoint,
  OperationAlert,
  OperationTag,
  PackageScoreBreakdown,
  RecommendPackageItem,
  SaleStatus,
  SalesSnapshot
} from '@content/shared';
import { INVENTORY_PRIORITIES, localDateKey } from '@content/shared';
import {
  buildOperationAlerts,
  buildOperationTags,
  buildPackageScore
} from '../domain/operation-rules';
import { buildPromotionScore } from '../domain/promotion-rules';
import { getFallbackDate, INVENTORY_BACKLOG_DAYS_THRESHOLD, MS_PER_DAY } from '../domain/utils';
import {
  buildInventoryFlag,
  normalizeInventoryTrend,
  type InventoryFlagResult
} from './inventory-flags';

export function isSellingPackage(item: RecommendPackageItem) {
  return item.saleStatus
    ? item.saleStatus === 'selling'
    : item.status !== 'pending_launch' && item.status !== 'sold_out';
}

export function resolveAsOfDate(date: string | undefined, snapshots: SalesSnapshot[]) {
  if (date) {
    const parsed = new Date(`${date}T12:00:00.000`);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return (
    snapshots
      .map((s) => new Date(s.snapshotTime))
      .filter((d) => Number.isFinite(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date()
  );
}

export function applyRoleFilter(
  packages: ContentPackage[],
  query: { areaId?: string; merchantId?: string; role?: string },
  warn?: (msg: string) => void
) {
  let result = packages;
  if (query.areaId) result = result.filter((pkg) => pkg.areaId === query.areaId);
  if (query.merchantId) result = result.filter((pkg) => pkg.merchantId === query.merchantId);
  if (query.role === 'area_operator' && !query.areaId)
    warn?.(
      'area_operator role without areaId — showing all packages. Select a specific area to filter.'
    );
  if (query.role === 'merchant_operator' && !query.merchantId)
    warn?.(
      'merchant_operator role without merchantId — showing all packages. Select a specific merchant to filter.'
    );
  return result;
}

export function inventoryBacklogDays(pkg: ContentPackage, snapshot: SalesSnapshot): number {
  const start = new Date(pkg.startTime).getTime();
  const snap = new Date(snapshot.snapshotTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(snap) || snap <= start) return 0;
  return Math.floor((snap - start) / MS_PER_DAY);
}

export function resolveRecommendInventory(
  stockLeft: number,
  saleStatus: SaleStatus | undefined,
  ensuredTrend: InventoryTrendPoint[]
) {
  return buildInventoryFlag({
    currentStockLeft: stockLeft,
    saleStatus,
    normalizedTrend: normalizeInventoryTrend(ensuredTrend)
  });
}

export function buildLiveInventoryTrends(
  snapshots: SalesSnapshot[],
  days: number,
  asOf: Date
): Map<string, InventoryTrendPoint[]> {
  const result = new Map<string, InventoryTrendPoint[]>(),
    dayEnd = new Date(asOf);
  dayEnd.setHours(23, 59, 59, 999);
  const dayStart = new Date(dayEnd);
  dayStart.setDate(dayStart.getDate() - Math.max(1, days) + 1);
  dayStart.setHours(0, 0, 0, 0);
  const latestByPkgAndDate = new Map<string, InventoryTrendPoint>();
  for (const snapshot of snapshots) {
    const snapshotDate = new Date(snapshot.snapshotTime);
    if (
      !Number.isFinite(snapshotDate.getTime()) ||
      snapshotDate < dayStart ||
      snapshotDate > dayEnd
    )
      continue;
    const date = localDateKey(snapshotDate),
      key = `${snapshot.packageId}:${date}`,
      point = {
        date,
        snapshotTime: snapshot.snapshotTime,
        remainingStock: Math.max(0, Math.round(snapshot.remainingStock))
      },
      previous = latestByPkgAndDate.get(key);
    if (!previous || point.snapshotTime > previous.snapshotTime) latestByPkgAndDate.set(key, point);
  }
  for (const [key, point] of latestByPkgAndDate.entries()) {
    const packageId = key.split(':')[0],
      points = result.get(packageId) ?? [];
    points.push(point);
    result.set(packageId, points);
  }
  for (const points of result.values()) points.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

export function ensureTodayInTrend(
  trend: InventoryTrendPoint[],
  stockLeft: number,
  snapshotTime: string
): InventoryTrendPoint[] {
  const snapshotDate = new Date(snapshotTime);
  const date = Number.isFinite(snapshotDate.getTime())
    ? localDateKey(snapshotDate)
    : localDateKey(new Date());
  if (trend.some((point) => point.date === date)) return trend;
  return [...trend, { date, snapshotTime, remainingStock: stockLeft }];
}

const INVENTORY_PRIORITY_RANK: Record<RecommendPackageItem['inventoryFlag'], number> = {
  normal: 0,
  unsold_today: 1,
  unsold_2d: 2,
  unsold_3d_slow: 3
};

export function sortRecommendItems(result: InternalRecommendItem[]) {
  const isBacklog = (item: RecommendPackageItem) =>
    item.inventoryPriority === INVENTORY_PRIORITIES[1];
  result.sort((a, b) => {
    const ai = a.item,
      bi = b.item,
      inventoryDelta =
        INVENTORY_PRIORITY_RANK[bi.inventoryFlag] - INVENTORY_PRIORITY_RANK[ai.inventoryFlag];
    if (inventoryDelta !== 0) return inventoryDelta;
    const priorityDelta = Number(isBacklog(bi)) - Number(isBacklog(ai));
    if (priorityDelta !== 0) return priorityDelta;
    if (bi.stockLeft !== ai.stockLeft) return bi.stockLeft - ai.stockLeft;
    if (bi.inventoryBacklogDays !== ai.inventoryBacklogDays)
      return bi.inventoryBacklogDays - ai.inventoryBacklogDays;
    return bi.promotionScore - ai.promotionScore;
  });
}

function assembleRecommendBaseItem(args: {
  pkg: ContentPackage;
  snapshot: SalesSnapshot;
  promotion: ReturnType<typeof buildPromotionScore>;
  inventory: InventoryFlagResult;
  inventoryBacklogDays: number;
  inventoryPriority: RecommendPackageItem['inventoryPriority'];
}): RecommendPackageItem {
  const { pkg, snapshot, promotion, inventory } = args;
  return {
    ...pkg,
    status: promotion.status,
    promotionLevel: promotion.level,
    promotionScore: promotion.score,
    inventoryBacklogDays: args.inventoryBacklogDays,
    inventoryPriority: args.inventoryPriority,
    inventoryFlag: inventory.inventoryFlag,
    inventoryFlagLabel: inventory.inventoryFlagLabel,
    inventoryFlagLevel: inventory.inventoryFlagLevel,
    inventorySalesFlag: inventory.inventorySalesFlag,
    inventorySalesLabel: inventory.inventorySalesLabel,
    inventorySalesLevel: inventory.inventorySalesLevel,
    inventoryObservedDays: inventory.inventoryObservedDays,
    inventorySoldOutDays: inventory.inventorySoldOutDays,
    inventoryUnsoldDays: inventory.inventoryUnsoldDays,
    inventoryTrend: inventory.inventoryTrend,
    recommendedStrategy: promotion.recommendedStrategy,
    reason: promotion.reason,
    riskTips: promotion.riskTips,
    recommendedChannels: promotion.recommendedChannels,
    conversionRate: snapshot.conversionRate,
    verifyRate: snapshot.verifyRate,
    refundRate: snapshot.refundRate
  };
}

function prepareRecommendInventory(
  pkg: ContentPackage,
  snapshot: SalesSnapshot,
  inventoryTrends: Map<string, InventoryTrendPoint[]>
) {
  const promotion = buildPromotionScore(pkg, snapshot, getFallbackDate()),
    stockLeft = pkg.stockLeft,
    rawTrend = inventoryTrends.get(pkg.packageId) ?? [],
    ensuredTrend = ensureTodayInTrend(rawTrend, stockLeft, snapshot.snapshotTime),
    backlogDays = inventoryBacklogDays(pkg, snapshot);
  const inventoryPriority: RecommendPackageItem['inventoryPriority'] =
    stockLeft > 0 && backlogDays >= INVENTORY_BACKLOG_DAYS_THRESHOLD
      ? INVENTORY_PRIORITIES[1]
      : INVENTORY_PRIORITIES[0];
  const inventory = resolveRecommendInventory(stockLeft, pkg.saleStatus, ensuredTrend);
  return { promotion, inventory, backlogDays, inventoryPriority };
}

function buildSingleRecommendItem(
  pkg: ContentPackage,
  snapshot: SalesSnapshot,
  inventoryTrends: Map<string, InventoryTrendPoint[]>,
  asOf: Date
): InternalRecommendItem {
  const prepared = prepareRecommendInventory(pkg, snapshot, inventoryTrends);
  const baseItem = assembleRecommendBaseItem({
    pkg,
    snapshot,
    promotion: prepared.promotion,
    inventory: prepared.inventory,
    inventoryBacklogDays: prepared.backlogDays,
    inventoryPriority: prepared.inventoryPriority
  });
  const scoreBreakdown = buildPackageScore(baseItem, snapshot);
  return {
    item: {
      ...baseItem,
      promotionScore: scoreBreakdown.totalScore,
      promotionLevel: scoreBreakdown.level,
      scoreBreakdown,
      operationTags: buildOperationTags(baseItem, scoreBreakdown, snapshot, asOf),
      operationAlerts: buildOperationAlerts(baseItem, scoreBreakdown, snapshot, asOf)
    },
    promotion: prepared.promotion
  };
}

export function buildRecommendPackageItems(
  packages: ContentPackage[],
  snapshotsByPkg: Map<string, SalesSnapshot>,
  inventoryTrends: Map<string, InventoryTrendPoint[]>,
  asOf: Date
): InternalRecommendItem[] {
  const result: InternalRecommendItem[] = [];
  for (const pkg of packages) {
    const snapshot = snapshotsByPkg.get(pkg.packageId);
    if (!snapshot) continue;
    result.push(buildSingleRecommendItem(pkg, snapshot, inventoryTrends, asOf));
  }
  sortRecommendItems(result);
  return result;
}

/** 批处理内部条目:item 是给前端的最终结果,promotion 保留给 getPackageAnalysis 复用 */
export interface InternalRecommendItem {
  item: RecommendPackageItem;
  promotion: ReturnType<typeof buildPromotionScore>;
}
/** getPackageAnalysis 返回类型 */
export interface PackageAnalysisResult {
  package: ContentPackage;
  status: string;
  promotionScore: number;
  inventoryBacklogDays: number;
  inventoryFlag: string;
  inventoryFlagLabel: string;
  inventoryFlagLevel: string;
  inventorySalesFlag: string;
  inventorySalesLabel: string;
  inventorySalesLevel: string;
  inventoryObservedDays: number;
  inventorySoldOutDays: number;
  inventoryUnsoldDays: number;
  inventoryTrend: InventoryTrendPoint[];
  salesData: SalesSnapshot;
  operationTags: OperationTag[];
  scoreBreakdown: PackageScoreBreakdown;
  operationAlerts: OperationAlert[];
  recommendation: {
    strategy: string;
    reason: string;
    suggestedChannels: Channel[];
    riskTips: string[];
    copyAngles: string[];
  };
  trends: Array<{ label: string; value: number }>;
}

function analysisTrends(snapshot: SalesSnapshot) {
  return [
    { label: '曝光', value: snapshot.exposureCount },
    { label: '点击', value: snapshot.clickCount },
    { label: '下单', value: snapshot.orderCount },
    { label: '支付', value: snapshot.paidOrderCount },
    { label: '核销', value: snapshot.verifyCount },
    { label: '退款', value: snapshot.refundCount }
  ];
}

export function buildPackageAnalysisResult(params: {
  pkg: ContentPackage;
  snapshot: SalesSnapshot;
  promotion: ReturnType<typeof buildPromotionScore>;
  recommendationItem: RecommendPackageItem;
  scoreBreakdown: PackageScoreBreakdown;
  operationTags: OperationTag[];
  operationAlerts: OperationAlert[];
}): PackageAnalysisResult {
  const {
    pkg,
    snapshot,
    promotion,
    recommendationItem,
    scoreBreakdown,
    operationTags,
    operationAlerts
  } = params;
  const r = recommendationItem;
  return {
    package: pkg,
    status: promotion.status,
    promotionScore: promotion.score,
    inventoryBacklogDays: r.inventoryBacklogDays,
    inventoryFlag: r.inventoryFlag,
    inventoryFlagLabel: r.inventoryFlagLabel,
    inventoryFlagLevel: r.inventoryFlagLevel,
    inventorySalesFlag: r.inventorySalesFlag,
    inventorySalesLabel: r.inventorySalesLabel,
    inventorySalesLevel: r.inventorySalesLevel,
    inventoryObservedDays: r.inventoryObservedDays,
    inventorySoldOutDays: r.inventorySoldOutDays,
    inventoryUnsoldDays: r.inventoryUnsoldDays,
    inventoryTrend: r.inventoryTrend,
    salesData: snapshot,
    operationTags,
    scoreBreakdown,
    operationAlerts,
    recommendation: {
      strategy: promotion.recommendedStrategy,
      reason: promotion.reason,
      suggestedChannels: promotion.recommendedChannels,
      riskTips: promotion.riskTips,
      copyAngles: promotion.copyAngles
    },
    trends: analysisTrends(snapshot)
  };
}
