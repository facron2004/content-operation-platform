import type { InventoryRuleConfig } from './rules-defaults';
import { MS_PER_DAY } from './utils';

export type StaleBucket = 'normal' | 'stale_7d' | 'stale_15d' | 'stale_30d' | 'stale_60d';
export function daysBetween(a: string, b: string): number {
  if (!a || !b || !/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
  const ta = Date.parse(a + 'T00:00:00Z'),
    tb = Date.parse(b + 'T00:00:00Z');
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.max(0, Math.floor((tb - ta) / MS_PER_DAY));
}
export interface ComputeStaleFlagInput {
  lastSalesDate: string | null;
  currentStockLeft: number;
  todayKey: string;
  rules: InventoryRuleConfig;
}
export function computeStaleFlag({
  lastSalesDate,
  currentStockLeft,
  todayKey,
  rules
}: ComputeStaleFlagInput): StaleBucket {
  if (currentStockLeft <= 0) return 'normal';
  if (!lastSalesDate) return 'stale_60d';
  const days = daysBetween(lastSalesDate, todayKey);
  if (days >= rules.stale60Days) return 'stale_60d';
  if (days >= rules.stale30Days) return 'stale_30d';
  if (days >= rules.stale15Days) return 'stale_15d';
  return days >= rules.stale7Days ? 'stale_7d' : 'normal';
}

export const STALE_BUCKET_LABELS: Record<StaleBucket, string> = {
  normal: '正常',
  stale_7d: '7天未销',
  stale_15d: '15天未销',
  stale_30d: '30天未销',
  stale_60d: '60天未销'
};
export const STALE_BUCKET_SEVERITY: Record<StaleBucket, number> = {
  normal: 0,
  stale_7d: 1,
  stale_15d: 2,
  stale_30d: 3,
  stale_60d: 4
};

export interface DiffDailySalesInput {
  lastStock: number | null;
  currentStock: number;
}
export interface DiffDailySalesResult {
  salesQty: number;
  deltaSource: 'jeesite_diff' | 'manual_correction' | 'backfill';
}
export function diffDailySales(input: DiffDailySalesInput): DiffDailySalesResult {
  const { lastStock, currentStock } = input;
  const safeCurrent = Math.max(0, Math.round(Number.isFinite(currentStock) ? currentStock : 0));
  if (lastStock == null) return { salesQty: 0, deltaSource: 'jeesite_diff' };
  const safeLast = Math.max(0, Math.round(lastStock));
  if (safeCurrent > safeLast) return { salesQty: 0, deltaSource: 'manual_correction' };
  /* 库存增加 → 补货日，当日 salesQty 记 0 */ return {
    salesQty: safeLast - safeCurrent,
    deltaSource: 'jeesite_diff'
  };
}
