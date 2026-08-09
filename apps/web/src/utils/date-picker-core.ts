export type DatePickerYmd = string;

export type DatePickerDayCell = {
  day: number;
  date: Date;
  ymd: DatePickerYmd;
  isCurrentMonth: boolean;
  isToday: boolean;
  disabled: boolean;
};

export function toDatePickerYmd(date: Date): DatePickerYmd {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDatePickerYmd(ymd: string): Date | null {
  if (!ymd) return null;
  const date = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDatePickerCn(ymd: string): string {
  const date = parseDatePickerYmd(ymd);
  if (!date) return ymd;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function isDatePickerToday(date: Date, today = new Date()): boolean {
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function makeDatePickerCell(
  date: Date,
  isCurrentMonth: boolean,
  disabledDate: (date: Date) => boolean
): DatePickerDayCell {
  return {
    day: date.getDate(),
    date,
    ymd: toDatePickerYmd(date),
    isCurrentMonth,
    isToday: isDatePickerToday(date),
    disabled: disabledDate(date)
  };
}

export function buildDatePickerCalendarDays(
  year: number,
  month: number,
  disabledDate: (date: Date) => boolean = () => false
): Array<DatePickerDayCell | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const days: Array<DatePickerDayCell | null> = [];

  for (let i = startDow - 1; i >= 0; i--) {
    days.push(makeDatePickerCell(new Date(year, month, -i), false, disabledDate));
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(makeDatePickerCell(new Date(year, month, i), true, disabledDate));
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(makeDatePickerCell(new Date(year, month + 1, i), false, disabledDate));
  }
  return days;
}
