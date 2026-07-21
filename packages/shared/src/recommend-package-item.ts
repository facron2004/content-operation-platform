import type {
  Channel,
  ContentPackage,
  PackageStatus,
  PromotionLevel,
  StrategyType
} from './package-types';
import type {
  InventoryFlag,
  InventoryFlagLevel,
  InventorySalesFlag,
  InventorySalesLevel,
  InventoryTrendPoint,
  OperationAlert,
  OperationTag,
  PackageScoreBreakdown
} from './operation-core-types';
export interface RecommendPackageItem extends ContentPackage {
  status: PackageStatus;
  promotionLevel: PromotionLevel;
  promotionScore: number;
  inventoryBacklogDays: number;
  inventoryPriority: 'normal' | 'backlog_3d';
  inventoryFlag: InventoryFlag;
  inventoryFlagLabel: string;
  inventoryFlagLevel: InventoryFlagLevel;
  inventorySalesFlag: InventorySalesFlag;
  inventorySalesLabel: string;
  inventorySalesLevel: InventorySalesLevel;
  inventoryObservedDays: number;
  inventorySoldOutDays: number;
  inventoryUnsoldDays: number;
  inventoryTrend: InventoryTrendPoint[];
  recommendedStrategy: StrategyType;
  reason: string;
  riskTips: string[];
  recommendedChannels: Channel[];
  conversionRate: number;
  verifyRate: number;
  refundRate: number;
  operationTags?: OperationTag[];
  scoreBreakdown?: PackageScoreBreakdown;
  operationAlerts?: OperationAlert[];
}
