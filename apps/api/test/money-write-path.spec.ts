import { describe, expect, it, vi } from 'vitest';
import {
  isSalesAmountReconciled,
  recomputeDailyMetricsRange,
  recomputePackageSalesAmountRange
} from '../src/money';

describe('recomputeDailyMetricsRange', () => {
  it('deletes only the date window then inserts aggregates', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(3) // DELETE
      .mockResolvedValueOnce(2); // INSERT
    const result = await recomputeDailyMetricsRange(
      { $executeRawUnsafe: execute },
      '2026-07-01',
      '2026-07-03'
    );
    expect(result).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      rowsAffected: 2
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(String(execute.mock.calls[0][0])).toMatch(/DELETE FROM "DailyMetrics"/);
    expect(execute.mock.calls[0][1]).toBe('2026-07-01');
    expect(execute.mock.calls[0][2]).toBe('2026-07-03');
    expect(String(execute.mock.calls[1][0])).toMatch(/INSERT OR REPLACE INTO "DailyMetrics"/);
  });

  it('rejects inverted range', async () => {
    await expect(
      recomputeDailyMetricsRange({ $executeRawUnsafe: vi.fn() }, '2026-07-10', '2026-07-01')
    ).rejects.toThrow(/startDate/);
  });
});

describe('package-sales-amount', () => {
  it('reconciles within absolute or relative tolerance', () => {
    expect(isSalesAmountReconciled(100, 100.5)).toBe(true);
    expect(isSalesAmountReconciled(1000, 1000.5)).toBe(true);
    expect(isSalesAmountReconciled(10000, 10020)).toBe(false); // 0.2% > 0.1% and > ¥1
    expect(isSalesAmountReconciled(10000, 10005)).toBe(true); // 0.05%
  });

  it('upserts salesAmount and reports coverage', async () => {
    const execute = vi.fn().mockResolvedValue(4);
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ gmv: 80 }]) // joinable
      .mockResolvedValueOnce([{ gmv: 100 }]); // total
    const result = await recomputePackageSalesAmountRange(
      { $executeRawUnsafe: execute, $queryRawUnsafe: query },
      '2026-07-01',
      '2026-07-02'
    );
    expect(result.rowsUpserted).toBe(4);
    expect(result.joinableGmv).toBe(80);
    expect(result.unjoinableGmv).toBe(20);
    expect(result.coverageRatio).toBeCloseTo(0.8);
    expect(String(execute.mock.calls[0][0])).toMatch(/PackageSalesDaily/);
    expect(String(execute.mock.calls[0][0])).toMatch(/salesAmount/);
  });
});
