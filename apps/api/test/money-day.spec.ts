import { describe, expect, it, vi } from 'vitest';
import { loadDayGmvFromOrderHeader } from '../src/money';
import { SQL_GMV_OH, beijingDayRangeSqlite, sqlDatetimeExclusiveRange } from '../src/common';

describe('money-day OrderHeader aggregate', () => {
  it('uses SQL_GMV_OH (online + wallet) and format-agnostic Beijing day bounds', async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([{ totalGmvFen: 10050n, paidOrderCount: 3 }]);
    const result = await loadDayGmvFromOrderHeader(
      { $queryRawUnsafe: queryRawUnsafe },
      '2026-07-10'
    );

    expect(result).toEqual({
      date: '2026-07-10',
      totalGmvFen: 10050n,
      paidOrderCount: 3,
      dataSource: 'OrderHeader'
    });

    const [sql, startBound, endBound] = queryRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain(SQL_GMV_OH);
    expect(String(sql)).toContain('OrderHeader');
    expect(String(sql)).toContain(sqlDatetimeExclusiveRange('"paidTime"'));
    // Beijing 2026-07-10 00:00+08 = 2026-07-09 16:00:00 UTC (space form)
    const expected = beijingDayRangeSqlite('2026-07-10');
    expect(startBound).toBe(expected.start);
    expect(endBound).toBe(expected.end);
    expect(startBound).toBe('2026-07-09 16:00:00');
    expect(endBound).toBe('2026-07-10 16:00:00');
  });
});
