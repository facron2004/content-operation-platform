/** Consolidated merchant-sales module. */
import { beijingDateKey } from '@content/shared';
import type { MerchantSalesSort, MerchantSalesWindow } from './merchant-sales.dto';

// --- merchant-sales-window-format.ts ---
export function sortColumn(sortBy: MerchantSalesSort): string {
  switch (sortBy) {
    case 'gmvDesc':
      return '("paidAmountOnline" + "paidAmountWallet")';
    case 'refundDesc':
      return '"refundAmount"';
    case 'verifyDesc':
      return '"verifyAmount"';
    case 'orderCountDesc':
      return '"orderCount"';
  }
}
export function csvCell(value: string): string {
  if (value == null) return '';
  const escaped = value.replace(/"/g, '""');
  if (/[",\r\n]/.test(value)) return `"${escaped}"`;
  return escaped;
}

// --- merchant-sales-window-sql.ts ---
export function whereClauseForWindow(window: MerchantSalesWindow): string {
  switch (window) {
    case 'day':
    case 'week':
    case 'month':
      return '"date" >= ? AND "date" <= ?';
    case 'year':
      return 'substr("date", 1, 4) = substr(?, 1, 4)';
  }
}
export function whereArgsForWindow(
  window: MerchantSalesWindow,
  start: string,
  end: string
): string[] {
  return window === 'year' ? [start] : [start, end];
}
export function bucketExprFor(window: MerchantSalesWindow): string {
  switch (window) {
    case 'week':
      return 'strftime(\'%Y-W%W\', "date")';
    case 'month':
      return 'substr("date", 1, 7)';
    case 'year':
      return 'substr("date", 1, 4)';
    case 'day':
      return '"date"';
  }
}

// --- merchant-sales-window.ts ---
export function resolveWindow(
  window: MerchantSalesWindow,
  date?: string,
  endDate?: string
): { start: string; end: string } {
  const today = date ?? beijingDateKey(new Date());
  if (window === 'day') return { start: today, end: today };
  return { start: date ?? beijingDateKey(addDays(new Date(), -29)), end: endDate ?? today };
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
