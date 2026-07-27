/** Resolve day/week/month/year windows + paidTime SQL bounds for data-analysis. */
import { BadRequestException } from '@nestjs/common';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { beijingDayRangeSqlite } from '../common';
import { assertInclusiveDaySpan, daySpanErrorCode, daySpanErrorSpan } from '../domain/sales-daily';
import type { DataAnalysisWindow } from './data-analysis.dto';

/**
 * Interactive export range cap. All windows (including year) must stay within this
 * paidTime day span so OrderHeader fan-out cannot pin SQLite / blow API memory.
 * Year is trailing-N ending at the anchor date — not full calendar year.
 */
export const DATA_ANALYSIS_READ_MAX_DAYS = 90;

export function resolveAnalysisWindow(
  window: DataAnalysisWindow,
  date?: string,
  endDate?: string
): { start: string; end: string } {
  const today = date ?? beijingDateKey(new Date());

  if (window === 'day') {
    try {
      assertInclusiveDaySpan(today, today, DATA_ANALYSIS_READ_MAX_DAYS);
    } catch {
      throw new BadRequestException('date/endDate 必须为 YYYY-MM-DD 格式');
    }
    return { start: today, end: today };
  }

  if (window === 'year') {
    // Interactive year = trailing 90d ending at anchor (not Jan 1–Dec 31).
    // Full-calendar year scans 365d OrderHeader + Excel detail and was a DoS vector.
    try {
      assertInclusiveDaySpan(today, today, DATA_ANALYSIS_READ_MAX_DAYS);
    } catch {
      throw new BadRequestException('date/endDate 必须为 YYYY-MM-DD 格式');
    }
    const end = today;
    const start = shiftDateKey(end, -(DATA_ANALYSIS_READ_MAX_DAYS - 1));
    return { start, end };
  }

  // week / month: default last 29 days ending at `today` when range omitted
  const start = date ?? beijingDateKey(addDays(new Date(), -29));
  const end = endDate ?? beijingDateKey(new Date());
  try {
    assertInclusiveDaySpan(start, end, DATA_ANALYSIS_READ_MAX_DAYS);
  } catch (err) {
    const code = daySpanErrorCode(err);
    if (code === 'START_AFTER_END') {
      throw new BadRequestException('date 必须 ≤ endDate');
    }
    if (code === 'SPAN_TOO_LONG') {
      const span = daySpanErrorSpan(err) ?? DATA_ANALYSIS_READ_MAX_DAYS + 1;
      throw new BadRequestException(
        `查询区间不能超过 ${DATA_ANALYSIS_READ_MAX_DAYS} 天（当前 ${span} 天）`
      );
    }
    throw new BadRequestException('date/endDate 必须为 YYYY-MM-DD 格式');
  }
  return { start, end };
}

/** Inclusive Beijing calendar range → exclusive paidTime SQLite bounds. */
export function paidTimeBounds(
  startDate: string,
  endDate: string
): {
  startBound: string;
  endBound: string;
} {
  return {
    startBound: beijingDayRangeSqlite(startDate).start,
    endBound: beijingDayRangeSqlite(endDate).end
  };
}

/**
 * Previous period of equal length, immediately before `start`.
 * Example: [2026-07-01, 2026-07-07] → previous [2026-06-24, 2026-06-30].
 */
export function previousEqualWindow(start: string, end: string): { start: string; end: string } {
  // Inclusive day count: end - start + 1
  let span = 1;
  let cursor = start;
  // Cap iterations; service already enforces max 90d.
  for (let i = 0; i < 200 && cursor < end; i++) {
    cursor = shiftDateKey(cursor, 1);
    span += 1;
  }
  const prevEnd = shiftDateKey(start, -1);
  const prevStart = shiftDateKey(prevEnd, -(span - 1));
  return { start: prevStart, end: prevEnd };
}

/** Fixed dashboard snapshot windows relative to an anchor (Beijing) day. */
export function fixedSnapshotWindows(anchor: string): Array<{
  key: 'today' | 'yesterday' | 'last7' | 'last30';
  label: string;
  start: string;
  end: string;
}> {
  const today = anchor;
  const yesterday = shiftDateKey(today, -1);
  return [
    { key: 'today', label: '今日', start: today, end: today },
    { key: 'yesterday', label: '昨日', start: yesterday, end: yesterday },
    { key: 'last7', label: '近7天', start: shiftDateKey(today, -6), end: today },
    { key: 'last30', label: '近30天', start: shiftDateKey(today, -29), end: today }
  ];
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
