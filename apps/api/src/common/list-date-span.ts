/**
 * Bound free-form dateFrom/dateTo filters on interactive list endpoints.
 * Unbounded COUNT + ORDER BY on audit/task tables is a SQLite pin vector.
 */
import { BadRequestException } from '@nestjs/common';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { assertInclusiveDaySpan, daySpanErrorCode, daySpanErrorSpan } from '../domain/sales-daily';

/** Inclusive interactive list window (matches merchant-sales / data-analysis read cap). */
export const INTERACTIVE_LIST_MAX_DAYS = 90;

/**
 * Always returns a closed [dateFrom, dateTo] pair within maxDays (inclusive).
 * - neither bound → trailing maxDays ending today
 * - only dateTo → trailing maxDays ending at dateTo
 * - only dateFrom → maxDays starting at dateFrom (clamped so end ≤ today when start is old)
 * - both → assert span ≤ maxDays and start ≤ end
 */
export function resolveInteractiveDateSpan(
  dateFrom?: string,
  dateTo?: string,
  maxDays: number = INTERACTIVE_LIST_MAX_DAYS
): { dateFrom: string; dateTo: string } {
  const today = beijingDateKey(new Date());
  const end = dateTo ?? (dateFrom ? shiftDateKey(dateFrom, maxDays - 1) : today);
  // Prefer explicit start; otherwise backfill from end so default lists stay bounded.
  const start = dateFrom ?? shiftDateKey(end, -(maxDays - 1));

  try {
    const { startDate, endDate } = assertInclusiveDaySpan(start, end, maxDays);
    return { dateFrom: startDate, dateTo: endDate };
  } catch (err) {
    const code = daySpanErrorCode(err);
    if (code === 'DATE_KEY') {
      throw new BadRequestException('dateFrom/dateTo 必须为 YYYY-MM-DD 格式');
    }
    if (code === 'START_AFTER_END') {
      throw new BadRequestException('dateFrom 必须 ≤ dateTo');
    }
    if (code === 'SPAN_TOO_LONG') {
      const span = daySpanErrorSpan(err);
      throw new BadRequestException(
        `查询区间不能超过 ${maxDays} 天${span != null ? `（当前 ${span + 1} 天）` : ''}`
      );
    }
    throw err;
  }
}
