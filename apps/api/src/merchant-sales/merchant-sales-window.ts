/** Consolidated merchant-sales module. */
import { BadRequestException } from '@nestjs/common';
import { beijingDateKey, endOfMonthKey, shiftDateKey, startOfWeekKey } from '@content/shared';
import { assertInclusiveDaySpan, daySpanErrorCode, daySpanErrorSpan } from '../domain/sales-daily';
import type { MerchantSalesSort, MerchantSalesWindow } from './merchant-sales.dto';

/** Max inclusive day span for interactive merchant-sales reads (list/export). */
export const MERCHANT_SALES_READ_MAX_DAYS = 90;
/** Year window bound: a single calendar year (≤366d) — multi-year stays blocked. */
export const MERCHANT_SALES_YEAR_MAX_DAYS = 366;
export { startOfWeekKey, endOfMonthKey };

// --- merchant-sales-window-format.ts ---
export function sortColumn(sortBy: MerchantSalesSort): string {
  // Return SELECT aliases — in a GROUP BY query, ordering by raw column names
  // picks an arbitrary row's value instead of the SUM aggregate, causing
  // non-deterministic sort order.
  switch (sortBy) {
    case 'gmvDesc':
      return '"gmv"';
    case 'refundDesc':
      return '"gmvRefund"';
    case 'verifyDesc':
      return '"gmvVerify"';
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
function assertDayKeyFormat(day: string): void {
  try {
    assertInclusiveDaySpan(day, day, MERCHANT_SALES_READ_MAX_DAYS);
  } catch {
    throw new BadRequestException('date/endDate 必须为 YYYY-MM-DD 格式');
  }
}

/**
 * Resolve read window for summary/ranking/trend/export.
 *
 * Anchor semantics (`date` = 业务日, defaults to today):
 * - day: the anchor day itself.
 * - week: calendar week (Mon–Sun) containing the anchor.
 * - month: calendar month (1st–last) containing the anchor.
 * - year: calendar year (Jan 1–Dec 31) containing the anchor.
 * Current week/month/year clamp their end at today so future days never enter
 * the range. Week/month ≤31d stay under MERCHANT_SALES_READ_MAX_DAYS; year is
 * bounded to a single calendar year (≤366d, MERCHANT_SALES_YEAR_MAX_DAYS) so
 * multi-year scans still cannot pin SQLite / blow CSV export via free-form
 * date/endDate (the explicit-endDate branch below keeps the 90d cap).
 */
export function resolveWindow(
  window: MerchantSalesWindow,
  date?: string,
  endDate?: string
): { start: string; end: string } {
  const today = beijingDateKey(new Date());
  const anchor = date ?? today;
  if (window === 'day') {
    assertDayKeyFormat(anchor);
    return { start: anchor, end: anchor };
  }
  if (window === 'year') {
    // Calendar year containing the anchor — not trailing 90d anymore.
    assertDayKeyFormat(anchor);
    const yearStart = `${anchor.slice(0, 4)}-01-01`;
    const yearEnd = `${anchor.slice(0, 4)}-12-31`;
    const end = yearEnd < today ? yearEnd : today;
    // Future-year anchor: collapse to a valid empty range.
    const resolvedEnd = end < yearStart ? yearStart : end;
    // Defense-in-depth: a single calendar year is structurally ≤366 days.
    assertInclusiveDaySpan(yearStart, resolvedEnd, MERCHANT_SALES_YEAR_MAX_DAYS);
    return { start: yearStart, end: resolvedEnd };
  }
  if (endDate) {
    // Free-form range (backward compatible): [date ?? today-29d, endDate].
    const start = date ?? shiftDateKey(today, -29);
    try {
      assertInclusiveDaySpan(start, endDate, MERCHANT_SALES_READ_MAX_DAYS);
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
    return { start, end: endDate };
  }
  assertDayKeyFormat(anchor);
  const periodStart = window === 'week' ? startOfWeekKey(anchor) : `${anchor.slice(0, 7)}-01`;
  const periodEnd = window === 'week' ? shiftDateKey(periodStart, 6) : endOfMonthKey(anchor);
  // Current period: stop at today (no future days). Past period: full span.
  const end = periodEnd < today ? periodEnd : today;
  // Future anchor: period lies after today — collapse to a valid empty range.
  return { start: periodStart, end: end < periodStart ? periodStart : end };
}
