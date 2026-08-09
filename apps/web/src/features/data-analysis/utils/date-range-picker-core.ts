import {
  buildDatePickerCalendarDays,
  formatDatePickerCn,
  isDatePickerToday,
  makeDatePickerCell,
  parseDatePickerYmd,
  toDatePickerYmd,
  type DatePickerDayCell,
  type DatePickerYmd
} from '../../../utils/date-picker-core';

export type DateRangeYmd = DatePickerYmd;
export type DateRangeTuple = [DateRangeYmd, DateRangeYmd];

export type DateRangeDayCell = DatePickerDayCell;

export const toDateRangeYmd = toDatePickerYmd;
export const parseDateRangeYmd = parseDatePickerYmd;
export const formatDateRangeCn = formatDatePickerCn;
export const isDateRangeToday = isDatePickerToday;
export const makeDateRangeCell = makeDatePickerCell;

export const buildDateRangeCalendarDays = (
  year: number,
  month: number,
  disabledDate: (date: Date) => boolean = () => false
): Array<DateRangeDayCell | null> => buildDatePickerCalendarDays(year, month, disabledDate);

export function normalizeDateRange(start: DateRangeYmd, end: DateRangeYmd): DateRangeTuple {
  return start <= end ? [start, end] : [end, start];
}
