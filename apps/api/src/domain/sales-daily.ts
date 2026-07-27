import type { InventoryRuleConfig } from './rules-defaults';
import { MS_PER_DAY } from './utils';

export type StaleBucket = 'normal' | 'stale_7d' | 'stale_15d' | 'stale_30d' | 'stale_60d';

/** Strict business-day key (YYYY-MM-DD). Shared with DTO Matches. */
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && DATE_KEY_RE.test(value);
}

export function daysBetween(a: string, b: string): number {
  if (!isDateKey(a) || !isDateKey(b)) return 0;
  const ta = Date.parse(a + 'T00:00:00Z'),
    tb = Date.parse(b + 'T00:00:00Z');
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.max(0, Math.floor((tb - ta) / MS_PER_DAY));
}

/**
 * Validate an inclusive refresh/recompute window.
 * Rejects non-YYYY-MM-DD keys (so IsDateString ISO datetimes cannot bypass
 * the day-span cap via daysBetween returning 0) and spans longer than maxDays.
 * Returns the validated keys for callers that already defaulted missing ends.
 */
export function assertInclusiveDaySpan(
  startDate: string,
  endDate: string,
  maxDays: number
): { startDate: string; endDate: string; span: number } {
  if (!isDateKey(startDate) || !isDateKey(endDate)) {
    throw Object.assign(new Error('DATE_KEY'), { code: 'DATE_KEY' as const });
  }
  if (startDate > endDate) {
    throw Object.assign(new Error('START_AFTER_END'), { code: 'START_AFTER_END' as const });
  }
  const span = daysBetween(startDate, endDate);
  // Defense-in-depth: if keys look valid but span collapses while start≠end,
  // refuse rather than treating a multi-year ISO window as "0 days".
  if (span === 0 && startDate !== endDate) {
    throw Object.assign(new Error('DATE_KEY'), { code: 'DATE_KEY' as const });
  }
  if (span > maxDays) {
    throw Object.assign(new Error('SPAN_TOO_LONG'), {
      code: 'SPAN_TOO_LONG' as const,
      span
    });
  }
  return { startDate, endDate, span };
}

export type DaySpanErrorCode = 'DATE_KEY' | 'START_AFTER_END' | 'SPAN_TOO_LONG';
export function daySpanErrorCode(err: unknown): DaySpanErrorCode | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  if (code === 'DATE_KEY' || code === 'START_AFTER_END' || code === 'SPAN_TOO_LONG') {
    return code;
  }
  return null;
}
export function daySpanErrorSpan(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const span = (err as { span?: unknown }).span;
  return typeof span === 'number' ? span : undefined;
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
