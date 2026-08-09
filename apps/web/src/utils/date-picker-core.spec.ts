import { describe, expect, it } from 'vitest';
import {
  buildDatePickerCalendarDays,
  formatDatePickerCn,
  parseDatePickerYmd,
  toDatePickerYmd
} from './date-picker-core';

describe('date picker core', () => {
  it('keeps local YMD formatting and parsing stable', () => {
    const date = new Date(2026, 7, 8);

    expect(toDatePickerYmd(date)).toBe('2026-08-08');
    expect(formatDatePickerCn('2026-08-08')).toBe('2026年8月8日');
    expect(parseDatePickerYmd('2026-08-08')?.getDate()).toBe(8);
    expect(parseDatePickerYmd('not-a-date')).toBeNull();
  });

  it('builds a fixed six-week calendar and passes disabledDate to every cell', () => {
    const days = buildDatePickerCalendarDays(
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
