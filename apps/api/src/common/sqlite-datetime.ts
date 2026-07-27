/**
 * SQLite raw inserts historically mixed ISO (`2026-07-21T07:30:18.000Z`) and
 * space form (`2026-07-21 07:30:18`). Lexicographic `<=` / `>=` then mis-order
 * because space (0x20) < 'T' (0x54). Normalize to UTC space form for storage and
 * wrap free-form columns with {@link sqlDatetime} in comparisons.
 */
import { beijingDayRangeUtc } from '@content/shared';

/** UTC `YYYY-MM-DD HH:MM:SS` suitable for SQLite datetime() and text storage. */
export function toSqliteDateTime(input: Date | string | number = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date for toSqliteDateTime');
  }
  // Drop millis + Z so SQLite datetime() accepts the value without strftime tricks.
  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
}

/**
 * Null-safe space-form UTC timestamp for optional OrderHeader business times.
 * Invalid input → null (callers treat as "no event time").
 */
export function toSqliteDateTimeOrNull(
  value: string | Date | number | null | undefined
): string | null {
  if (value == null || value === '') return null;
  try {
    return toSqliteDateTime(value);
  } catch {
    return null;
  }
}

/**
 * SQL expression that coerces a text timestamp column (ISO or space form) into
 * a value comparable via datetime(). Use with params from {@link toSqliteDateTime}.
 */
export function sqlDatetime(columnSql: string): string {
  // replace(T→space) then strip trailing Z; datetime() ignores fractional seconds.
  return `datetime(replace(replace(${columnSql}, 'T', ' '), 'Z', ''))`;
}

/**
 * Exclusive Beijing-day half-open range as SQLite space-form params:
 *   sqlDatetime(col) >= datetime(?) AND sqlDatetime(col) < datetime(?)
 * Matches both historical ISO rows and new space-form writes.
 */
export function beijingDayRangeSqlite(date: string): { start: string; end: string } {
  const { start, end } = beijingDayRangeUtc(date);
  return { start: toSqliteDateTime(start), end: toSqliteDateTime(end) };
}

/**
 * SQL fragment for exclusive half-open range on a free-form timestamp column.
 * Pair with params from {@link beijingDayRangeSqlite} / {@link toSqliteDateTime}.
 */
export function sqlDatetimeExclusiveRange(columnSql: string): string {
  return `${sqlDatetime(columnSql)} >= datetime(?) AND ${sqlDatetime(columnSql)} < datetime(?)`;
}

/** Beijing calendar day of a free-form timestamp column (UTC+8). */
export function sqlBeijingDate(columnSql: string): string {
  return `date(${sqlDatetime(columnSql)}, '+8 hours')`;
}
