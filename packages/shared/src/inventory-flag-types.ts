import type {
  InventoryFlag,
  InventoryFlagLevel,
  InventorySalesFlag,
  InventorySalesLevel,
  InventoryTrendPoint
} from './operation-core-types';
import type { SaleStatus } from './package-types';
export interface InventoryFlagInput {
  currentStockLeft: number;
  saleStatus?: SaleStatus;
  normalizedTrend: InventoryTrendPoint[];
}
export interface InventoryFlagResult {
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
  priority: number;
}
