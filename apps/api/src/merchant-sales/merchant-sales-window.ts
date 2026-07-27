/** Consolidated merchant-sales module. */
import { BadRequestException } from '@nestjs/common';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { SQL_GMV_SS } from '../common/gmv-math';
import { assertInclusiveDaySpan, daySpanErrorCode, daySpanErrorSpan } from '../domain/sales-daily';
import type { MerchantSalesSort, MerchantSalesWindow } from './merchant-sales.dto';

/** Max inclusive day span for interactive merchant-sales reads (list/export). */
export const MERCHANT_SALES_READ_MAX_DAYS = 90;

// --- merchant-sales-window-format.ts ---
export function sortColumn(sortBy: MerchantSalesSort): string {
  switch (sortBy) {
    case 'gmvDesc':
      // Same composition as SQL_GMV_SS (online + wallet; bonus never included).
      return `(${SQL_GMV_SS})`;
    case 'refundDesc':
      return '"refundAmount"';
    case 'verifyDesc':
      return '"verifyAmount"';
    case 'orderCountDesc':
      return '"orderCount"';
  }
}
export { csvCell, csvEscape } from '../common/csv-escape';

// --- merchant-sales-window-sql.ts ---
export function whereClauseForWindow(window: MerchantSalesWindow): string {
  // All windows use inclusive date bounds — year is trailing-N, not calendar year.
  void window;
  return '"date" >= ? AND "date" <= ?';
}
export function whereArgsForWindow(
  _window: MerchantSalesWindow,
  start: string,
  end: string
): string[] {
  return [start, end];
}
export function bucketExprFor(window: MerchantSalesWindow): string {
  switch (window) {
    case 'week':
      return 'strftime(\'%Y-W%W\', "date")';
    case 'month':
      return 'substr("date", 1, 7)';
    case 'year':
      // Trailing 90d still buckets by calendar year label for trend charts.
      return 'substr("date", 1, 4)';
    case 'day':
      return '"date"';
  }
}

// --- merchant-sales-window.ts ---
/**
 * Resolve read window for summary/ranking/trend/export.
 * Caps all interactive ranges (including year) at MERCHANT_SALES_READ_MAX_DAYS so
 * multi-year scans cannot pin SQLite / blow CSV export via free-form date/endDate.
 * `year` is trailing-N ending at the anchor date — not full calendar year.
 */
export function resolveWindow(
  window: MerchantSalesWindow,
  date?: string,
  endDate?: string
): { start: string; end: string } {
  const today = date ?? beijingDateKey(new Date());
  if (window === 'day') {
    try {
      assertInclusiveDaySpan(today, today, MERCHANT_SALES_READ_MAX_DAYS);
    } catch {
      throw new BadRequestException('date/endDate 必须为 YYYY-MM-DD 格式');
    }
    return { start: today, end: today };
  }
  if (window === 'year') {
    // Interactive year = trailing 90d ending at anchor (not Jan 1–Dec 31).
    // Full-calendar year scans ~365 MerchantDailyMetrics rows + CSV fan-out.
    try {
      assertInclusiveDaySpan(today, today, MERCHANT_SALES_READ_MAX_DAYS);
    } catch {
      throw new BadRequestException('date/endDate 必须为 YYYY-MM-DD 格式');
    }
    const end = today;
    const start = shiftDateKey(end, -(MERCHANT_SALES_READ_MAX_DAYS - 1));
    return { start, end };
  }
  const start = date ?? beijingDateKey(addDays(new Date(), -29));
  const end = endDate ?? today;
  try {
    assertInclusiveDaySpan(start, end, MERCHANT_SALES_READ_MAX_DAYS);
  } catch (err) {
    const code = daySpanErrorCode(err);
    if (code === 'START_AFTER_END') {
      throw new BadRequestException('date 必须 ≤ endDate');
    }
    if (code === 'SPAN_TOO_LONG') {
      const span = daySpanErrorSpan(err) ?? MERCHANT_SALES_READ_MAX_DAYS + 1;
      throw new BadRequestException(
        `查询区间不能超过 ${MERCHANT_SALES_READ_MAX_DAYS} 天（当前 ${span} 天）`
      );
    }
    throw new BadRequestException('date/endDate 必须为 YYYY-MM-DD 格式');
  }
  return { start, end };
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
