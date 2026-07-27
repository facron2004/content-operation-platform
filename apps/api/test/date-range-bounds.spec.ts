import { describe, expect, it } from 'vitest';
import {
  sqlBeijingDate,
  sqlDatetime,
  sqlDatetimeExclusiveRange
} from '../src/common/sqlite-datetime';

/**
 * dateFrom/dateTo are YYYY-MM-DD business keys. Prefer exclusive half-open filters:
 *   sqlDatetimeExclusiveRange(col) + beijingDayRangeSqlite(start/end)
 * so indexes can seek and mixed ISO/space storage still matches. Keep
 * sqlBeijingDate for SELECT/GROUP BY day bucketing only. ORDER BY free-form
 * times must also use sqlDatetime.
 */
describe('date range bounds for SQLite datetime columns', () => {
  it('space-format timestamps sort below ISO T-format on the same calendar day', () => {
    const sqlite = '2026-07-21 23:59:59';
    const isoEnd = '2026-07-21T16:00:00.000Z';
    expect(sqlite < isoEnd).toBe(true);
  });

  it('ISO start bound can exclude Beijing-midnight UTC rows under space format', () => {
    const beijingMidnightUtc = '2026-07-20 16:00:00';
    const isoStart = '2026-07-20T16:00:00.000Z';
    expect(beijingMidnightUtc >= isoStart).toBe(false);
  });

  it('exclusive datetime range is the intended filter shape for free-form createdAt', () => {
    const sql = sqlDatetimeExclusiveRange('t."createdAt"');
    expect(sql).toContain('replace(replace');
    expect(sql).toContain('>= datetime(?)');
    expect(sql).toContain('< datetime(?)');
    // sqlBeijingDate remains available for day bucketing, not WHERE filters.
    expect(sqlBeijingDate('t."createdAt"')).toContain('+8 hours');
  });

  it('OrderHeader exclusive range must normalize mixed ISO/space storage', () => {
    // A space-form paidTime inside the Beijing day would fail raw ISO string compare
    // if the end bound is ISO and the row is space form (space < 'T').
    const spacePaid = '2026-07-10 01:00:00'; // UTC
    const isoEnd = '2026-07-10T16:00:00.000Z';
    expect(spacePaid < isoEnd).toBe(true); // lexically true but not via datetime()
    // With sqlDatetimeExclusiveRange both sides go through datetime() so form is irrelevant.
    const rangeSql = sqlDatetimeExclusiveRange('"paidTime"');
    expect(rangeSql).toContain('replace(replace');
    expect(rangeSql).toContain('< datetime(?)');
  });

  it('ORDER BY free-form OrderHeader times must use sqlDatetime', () => {
    // Lexicographic DESC puts ISO rows before space rows of a later wall-clock time.
    const laterSpace = '2026-07-21 23:59:59';
    const earlierIso = '2026-07-21T00:00:00.000Z';
    expect(laterSpace < earlierIso).toBe(true); // raw ORDER BY would put later space first incorrectly under ASC
    const orderSql = `ORDER BY ${sqlDatetime('oh."orderTime"')} DESC`;
    expect(orderSql).toContain('replace(replace');
    expect(orderSql).toContain('DESC');
  });
});
