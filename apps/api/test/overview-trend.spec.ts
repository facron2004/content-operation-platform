import { describe, expect, it, vi } from 'vitest';
import { loadTrendRows } from '../src/overview/overview-trend';

describe('overview trend money contract', () => {
  it('returns GMV as fen instead of an ambiguous legacy number', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ date: '2026-08-11', gmvFen: 2493162n, paidOrderCount: 12 }]);
    const result = await loadTrendRows(
      { $queryRawUnsafe: queryRaw } as never,
      '2026-08-11',
      '2026-08-11'
    );

    expect(result).toEqual([{ date: '2026-08-11', gmvFen: 2493162n, paidOrderCount: 12 }]);
    expect(queryRaw.mock.calls[0]?.[0]).toContain('AS "gmvFen"');
  });
});
