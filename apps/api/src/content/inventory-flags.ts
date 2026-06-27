import type {
  InventoryFlagInput,
  InventoryFlagResult,
  InventorySalesFlag,
  InventorySalesLevel,
  InventoryTrendPoint
} from '@content/shared';

export type { InventoryFlagInput, InventoryFlagResult };

const normalResult = (normalizedTrend: InventoryTrendPoint[] = []): InventoryFlagResult => ({
  inventoryFlag: 'normal',
  inventoryFlagLabel: '正常',
  inventoryFlagLevel: 'none',
  ...buildInventorySalesStatusFromNormalized(normalizedTrend),
  inventoryUnsoldDays: 0,
  inventoryTrend: normalizedTrend,
  priority: 0
});

export function normalizeInventoryTrend(trend: InventoryTrendPoint[]) {
  const byDate = new Map<string, InventoryTrendPoint>();

  for (const point of trend) {
    if (!point.date || !Number.isFinite(point.remainingStock)) continue;
    const previous = byDate.get(point.date);
    if (!previous || point.snapshotTime > previous.snapshotTime) {
      byDate.set(point.date, {
        date: point.date,
        snapshotTime: point.snapshotTime,
        remainingStock: Math.max(0, Math.round(point.remainingStock))
      });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildInventoryFlag(input: InventoryFlagInput): InventoryFlagResult {
  // 调用方必须传已 normalize 的 trend (InventoryFlagInput.normalizedTrend)
  // —— 批量路径上由 buildRecommendPackageItems 负责 normalize,避免每个套餐重复 sort
  const normalizedTrend = input.normalizedTrend;
  const currentStockLeft = Math.max(0, Math.round(input.currentStockLeft));
  const inventorySalesStatus = buildInventorySalesStatusFromNormalized(normalizedTrend);

  if (currentStockLeft <= 0 || input.saleStatus === 'recycle') {
    return normalResult(normalizedTrend);
  }

  const stockedFromLatest = [...normalizedTrend].reverse();
  let inventoryUnsoldDays = 0;
  for (const point of stockedFromLatest) {
    if (point.remainingStock <= 0) break;
    inventoryUnsoldDays += 1;
  }

  if (inventoryUnsoldDays >= 3) {
    return {
      inventoryFlag: 'unsold_3d_slow',
      inventoryFlagLabel: '连续3天未售罄',
      inventoryFlagLevel: 'danger',
      ...inventorySalesStatus,
      inventoryUnsoldDays,
      inventoryTrend: normalizedTrend,
      priority: 3
    };
  }

  if (inventoryUnsoldDays >= 2) {
    return {
      inventoryFlag: 'unsold_2d',
      inventoryFlagLabel: '连续2天未售罄',
      inventoryFlagLevel: 'warning',
      ...inventorySalesStatus,
      inventoryUnsoldDays,
      inventoryTrend: normalizedTrend,
      priority: 2
    };
  }

  return {
    inventoryFlag: 'unsold_today',
    inventoryFlagLabel: '今日未售罄',
    inventoryFlagLevel: 'info',
    ...inventorySalesStatus,
    inventoryUnsoldDays: Math.max(1, inventoryUnsoldDays),
    inventoryTrend: normalizedTrend,
    priority: 1
  };
}

/**
 * 内部:假定 trend 已 normalize,直接计算 sales status。
 * 与旧 `buildInventorySalesStatus` 等价,只是不再调用 normalizeInventoryTrend。
 * 批量路径上由 buildRecommendPackageItems 负责 normalize,避免每个套餐重复 sort。
 */
function buildInventorySalesStatusFromNormalized(normalizedTrend: InventoryTrendPoint[]) {
  const recentTrend = normalizedTrend.slice(-3);
  const inventoryObservedDays = recentTrend.length;
  const inventorySoldOutDays = recentTrend.filter((point) => point.remainingStock <= 0).length;

  if (inventoryObservedDays >= 3 && inventorySoldOutDays === inventoryObservedDays) {
    return {
      inventorySalesFlag: 'hot_sold_out_recent' as InventorySalesFlag,
      inventorySalesLabel: '连续售罄·热销',
      inventorySalesLevel: 'success' as InventorySalesLevel,
      inventoryObservedDays,
      inventorySoldOutDays
    };
  }

  if (inventoryObservedDays >= 3 && inventorySoldOutDays === 0) {
    return {
      inventorySalesFlag: 'slow_never_sold_out' as InventorySalesFlag,
      inventorySalesLabel: '连续未售罄·滞销',
      inventorySalesLevel: 'danger' as InventorySalesLevel,
      inventoryObservedDays,
      inventorySoldOutDays
    };
  }

  return {
    inventorySalesFlag: 'observing' as InventorySalesFlag,
    inventorySalesLabel: '观察中',
    inventorySalesLevel: 'info' as InventorySalesLevel,
    inventoryObservedDays,
    inventorySoldOutDays
  };
}
