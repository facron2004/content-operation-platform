import { describe, expect, it } from 'vitest';
import {
  beijingDayRangeSqlite,
  sqlBeijingDate,
  sqlDatetime,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime,
  toSqliteDateTimeOrNull
} from '../src/common/sqlite-datetime';

describe('toSqliteDateTime', () => {
  it('formats UTC as YYYY-MM-DD HH:MM:SS without T/Z', () => {
    const s = toSqliteDateTime(new Date('2026-07-16T12:34:56.789Z'));
    expect(s).toBe('2026-07-16 12:34:56');
    expect(s).not.toContain('T');
    expect(s).not.toContain('Z');
  });

  it('accepts epoch millis and ISO strings', () => {
    const fromMs = toSqliteDateTime(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(fromMs).toBe('2026-01-01 00:00:00');
    const fromIso = toSqliteDateTime('2026-07-16T01:02:03.000Z');
    expect(fromIso).toBe('2026-07-16 01:02:03');
  });

  it('throws on invalid input', () => {
    expect(() => toSqliteDateTime('not-a-date')).toThrow(/Invalid date/);
  });
});

describe('toSqliteDateTimeOrNull', () => {
  it('returns null for empty/invalid, space form for valid', () => {
    expect(toSqliteDateTimeOrNull(null)).toBeNull();
    expect(toSqliteDateTimeOrNull('')).toBeNull();
    expect(toSqliteDateTimeOrNull('bogus')).toBeNull();
    expect(toSqliteDateTimeOrNull('2026-07-16T01:02:03.000Z')).toBe('2026-07-16 01:02:03');
  });
});

describe('sqlDatetime helpers', () => {
  it('wraps column with T/Z normalization', () => {
    const expr = sqlDatetime('"plannedAt"');
    expect(expr).toBe("datetime(replace(replace(\"plannedAt\", 'T', ' '), 'Z', ''))");
  });

  it('builds exclusive range SQL that works for mixed storage', () => {
    const sql = sqlDatetimeExclusiveRange('"paidTime"');
    expect(sql).toContain("replace(replace(\"paidTime\", 'T', ' '), 'Z', '')");
    expect(sql).toContain('>= datetime(?)');
    expect(sql).toContain('< datetime(?)');
  });

  it('builds Beijing calendar day expression', () => {
    expect(sqlBeijingDate('"paidTime"')).toContain('+8 hours');
  });

  it('beijingDayRangeSqlite returns exclusive space-form bounds', () => {
    // Beijing 2026-07-10 00:00+08 → 2026-07-09 16:00:00 UTC
    const r = beijingDayRangeSqlite('2026-07-10');
    expect(r.start).toBe('2026-07-09 16:00:00');
    expect(r.end).toBe('2026-07-10 16:00:00');
  });

  it('documents the lexicographic trap between ISO and space form', () => {
    const space = '2026-07-21 23:59:59';
    const iso = '2026-07-21T00:00:00.000Z';
    // space (0x20) < 'T' (0x54) → afternoon space rows always look "before" ISO midnight
    expect(space < iso).toBe(true);
    // After normalize both compare correctly as datetimes of the same day
    const normSpace = toSqliteDateTime(space.replace(' ', 'T') + 'Z');
    const normIso = toSqliteDateTime(iso);
    expect(normSpace > normIso).toBe(true);
  });
});
