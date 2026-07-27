import { describe, expect, it } from 'vitest';
import { beijingDateKey } from '@content/shared';
import {
  buildLiveInventoryTrends,
  ensureTodayInTrend,
  resolveAsOfDate
} from '../src/content/content-recommend-core';

describe('resolveAsOfDate (Beijing anchor)', () => {
  it('parses YYYY-MM-DD as Beijing noon (UTC 04:00)', () => {
    const asOf = resolveAsOfDate('2026-07-16', []);
    // Beijing noon = 04:00 UTC same calendar day
    expect(asOf.toISOString()).toBe('2026-07-16T04:00:00.000Z');
  });

  it('falls back to latest snapshotTime when date is absent', () => {
    const asOf = resolveAsOfDate(undefined, [
      { snapshotTime: '2026-07-10T10:00:00.000Z' } as never,
      { snapshotTime: '2026-07-12T08:00:00.000Z' } as never
    ]);
    expect(asOf.toISOString()).toBe('2026-07-12T08:00:00.000Z');
  });

  it('ignores unparseable date strings and uses snapshots', () => {
    const asOf = resolveAsOfDate('not-a-date', [
      { snapshotTime: '2026-07-01T00:00:00.000Z' } as never
    ]);
    expect(asOf.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('ensureTodayInTrend (Beijing day key)', () => {
  it('keys the injected point with beijingDateKey of snapshotTime', () => {
    // 2026-07-16T16:30:00Z = 2026-07-17 00:30 Beijing → day key 2026-07-17
    const trend = ensureTodayInTrend([], 12, '2026-07-16T16:30:00.000Z');
    expect(trend).toHaveLength(1);
    expect(trend[0].date).toBe('2026-07-17');
    expect(trend[0].remainingStock).toBe(12);
    expect(beijingDateKey('2026-07-16T16:30:00.000Z')).toBe('2026-07-17');
  });

  it('does not duplicate when Beijing day already present', () => {
    const existing = [
      {
        date: '2026-07-17',
        snapshotTime: '2026-07-16T16:00:00.000Z',
        remainingStock: 5
      }
    ];
    const trend = ensureTodayInTrend(existing, 99, '2026-07-16T18:00:00.000Z');
    expect(trend).toHaveLength(1);
    expect(trend[0].remainingStock).toBe(5);
  });
});

describe('buildLiveInventoryTrends (Beijing window)', () => {
  it('includes snapshots on the Beijing day of asOf and excludes the next day', () => {
    // asOf = 2026-07-17 Beijing noon → endKey 2026-07-17
    // Window of 1 day: [2026-07-17 00:00+08, 2026-07-18 00:00+08)
    const asOf = new Date('2026-07-17T04:00:00.000Z');
    const trends = buildLiveInventoryTrends(
      [
        // Just after Beijing midnight 07-17 (= UTC 16:00 on 07-16)
        {
          packageId: 'p1',
          snapshotTime: '2026-07-16T16:00:00.000Z',
          remainingStock: 10
        } as never,
        // Just before next Beijing midnight
        {
          packageId: 'p1',
          snapshotTime: '2026-07-17T15:59:00.000Z',
          remainingStock: 8
        } as never,
        // Next Beijing day — must be excluded
        {
          packageId: 'p1',
          snapshotTime: '2026-07-17T16:00:00.000Z',
          remainingStock: 1
        } as never
      ],
      1,
      asOf
    );
    const points = trends.get('p1') ?? [];
    expect(points).toHaveLength(1);
    expect(points[0].date).toBe('2026-07-17');
    // Latest snapshot on that Beijing day wins
    expect(points[0].remainingStock).toBe(8);
  });
});
