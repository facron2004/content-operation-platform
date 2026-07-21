/** Business dates use Beijing (UTC+8). Day boundary: Beijing 00:00 = UTC 16:00 previous day. */ export function beijingDateKey(
  input: Date | string | number = new Date()
): string {
  const d = input instanceof Date ? input : new Date(input);
  const utcDateStr = d.toISOString().slice(0, 10);
  return d.getUTCHours() >= 16 ? shiftDateString(utcDateStr, 1) : utcDateStr;
}
function shiftDateString(yyyyMmDd: string, days: number): string {
  const padTwo = (n: number): string => String(n).padStart(2, '0');
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${shifted.getUTCFullYear()}-${padTwo(shifted.getUTCMonth() + 1)}-${padTwo(shifted.getUTCDate())}`;
}
export function shiftDateKey(yyyyMmDd: string, days: number): string {
  return shiftDateString(yyyyMmDd, days);
}
export function beijingDayRangeUtc(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}
