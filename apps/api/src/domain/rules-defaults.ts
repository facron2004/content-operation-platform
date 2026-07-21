import type { PackageStatus, RuleType } from '@content/shared';
import { INVENTORY_BACKLOG_DAYS_THRESHOLD, INVENTORY_SLOW_DAYS_THRESHOLD } from './utils';

export interface PromotionRuleConfig {
  baseScoreByStockRatio: { maxRatio: number; score: number }[];
  statusScoreDelta: Record<PackageStatus, number>;
  scoreLevel: { s: number; a: number; b: number; c: number };
}

export interface CopyRuleConfig {
  forbiddenWords: string[];
}

export interface InventoryRuleConfig {
  backlogDays: number;
  slowDays: number;
  stale7Days: number;
  stale15Days: number;
  stale30Days: number;
  stale60Days: number;
}

export const STATUS_SCORE_DELTA: Record<PackageStatus, number> = {
  pending_launch: -6,
  nearly_sold_out: 4,
  sold_out: -30,
  healthy_sales: 0,
  surging: 0,
  cold_start: 0,
  conversion_weak: 0,
  poor_sales: 0,
  high_refund_risk: 0,
  high_verify: 0,
  low_verify: 0,
  unclear_selling_point: 0
};

export const DEFAULT_PROMOTION_RULES: PromotionRuleConfig = {
  baseScoreByStockRatio: [
    { maxRatio: 0.2, score: 92 },
    { maxRatio: 0.5, score: 80 },
    { maxRatio: 0.8, score: 68 },
    { maxRatio: 1.0, score: 50 }
  ],
  statusScoreDelta: STATUS_SCORE_DELTA,
  scoreLevel: { s: 85, a: 70, b: 55, c: 40 }
};

export const DEFAULT_COPY_RULES: CopyRuleConfig = {
  forbiddenWords: ['全网最低', '最后疯抢', '错过后悔', '稳赚', '保证返利']
};

export const DEFAULT_INVENTORY_RULES: InventoryRuleConfig = {
  backlogDays: INVENTORY_BACKLOG_DAYS_THRESHOLD,
  slowDays: INVENTORY_SLOW_DAYS_THRESHOLD,
  stale7Days: 7,
  stale15Days: 15,
  stale30Days: 30,
  stale60Days: 60
};

export const DEFAULT_RULES: Record<RuleType, unknown> = {
  promotion: DEFAULT_PROMOTION_RULES,
  copy: DEFAULT_COPY_RULES,
  inventory: DEFAULT_INVENTORY_RULES,
  alert: {}
};

export function mergeRuleConfig<T>(type: RuleType, payload: Record<string, unknown> | null): T {
  const base = DEFAULT_RULES[type] as Record<string, unknown>;
  if (!payload) return base as T;
  return { ...base, ...payload } as T;
}
