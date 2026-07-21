import { describe, expect, it, vi } from 'vitest';
import { loadDayGmvFromOrderHeader } from '../src/money';
import { SQL_GMV_OH } from '../src/common';

describe('money-day OrderHeader aggregate', () => {
  it('uses SQL_GMV_OH (online + wallet) and Beijing day bounds', async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([{ totalGmv: 100.5, paidOrderCount: 3 }]);
    const result = await loadDayGmvFromOrderHeader(
      { $queryRawUnsafe: queryRawUnsafe },
      '2026-07-10'
    );

    expect(result).toEqual({
      date: '2026-07-10',
      totalGmv: 100.5,
      paidOrderCount: 3,
      dataSource: 'OrderHeader'
    });

    const [sql, startIso, endIso] = queryRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain(SQL_GMV_OH);
    expect(String(sql)).toContain('OrderHeader');
    // Beijing 2026-07-10 00:00+08 = 2026-07-09T16:00:00.000Z
    expect(startIso).toBe('2026-07-09T16:00:00.000Z');
    expect(endIso).toBe('2026-07-10T16:00:00.000Z');
  });
});
