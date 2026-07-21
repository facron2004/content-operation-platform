export type InventoryFlag = 'normal' | 'unsold_today' | 'unsold_2d' | 'unsold_3d_slow';
export type InventorySalesFlag = 'observing' | 'hot_sold_out_recent' | 'slow_never_sold_out';
export type InventoryFlagLevel = 'none' | 'info' | 'warning' | 'danger';
export type InventorySalesLevel = 'none' | 'info' | 'success' | 'warning' | 'danger';
export interface InventoryTrendPoint {
  date: string;
  snapshotTime: string;
  remainingStock: number;
}
