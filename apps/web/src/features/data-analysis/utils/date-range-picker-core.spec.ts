import { describe, expect, it } from 'vitest';
import {
  buildDateRangeCalendarDays,
  formatDateRangeCn,
  normalizeDateRange,
  parseDateRangeYmd,
  toDateRangeYmd
} from './date-range-picker-core';

describe('date range picker core', () => {
  it('formats and parses local calendar dates without changing the selected day', () => {
    const date = new Date(2026, 7, 8);

    expect(toDateRangeYmd(date)).toBe('2026-08-08');
    expect(formatDateRangeCn('2026-08-08')).toBe('2026年8月8日');
    expect(parseDateRangeYmd('2026-08-08')?.getDate()).toBe(8);
    expect(parseDateRangeYmd('not-a-date')).toBeNull();
  });

  it('normalizes a reversed range while preserving an equal-day range', () => {
    expect(normalizeDateRange('2026-08-12', '2026-08-08')).toEqual(['2026-08-08', '2026-08-12']);
    expect(normalizeDateRange('2026-08-08', '2026-08-08')).toEqual(['2026-08-08', '2026-08-08']);
  });

  it('builds a fixed six-week calendar and applies disabledDate to every cell', () => {
    const days = buildDateRangeCalendarDays(
      2026,
      7,
      (date) => date.getDate() === 8 && date.getMonth() === 7
    );

    expect(days).toHaveLength(42);
    expect(days.filter((day) => day?.isCurrentMonth)).toHaveLength(31);
    expect(days.find((day) => day?.ymd === '2026-08-08')?.disabled).toBe(true);
    expect(days.find((day) => day?.ymd === '2026-07-31')?.isCurrentMonth).toBe(false);
  });
});
