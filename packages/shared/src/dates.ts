const padTwo = (n: number): string => String(n).padStart(2, '0');
export const nowISO = (date: Date = new Date()): string => date.toISOString();
export const futureISO = (offsetMs: number): string =>
  new Date(Date.now() + offsetMs).toISOString();
export const msToISO = (ms: number): string | null => (ms > 0 ? new Date(ms).toISOString() : null);
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}
export {
  beijingDateKey,
  shiftDateKey,
  beijingDayRangeUtc,
  startOfWeekKey,
  endOfMonthKey
} from './dates-beijing';
