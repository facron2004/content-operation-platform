import { describe, expect, it, vi } from 'vitest';
import { sqlDatetimeExclusiveRange } from '../src/common';
import { queryOrderHeaderGmv } from '../src/gmv/gmv-order-header.query';

describe('GMV OrderHeader source freshness', () => {
  it('takes MAX(updatedAt) from the same paidTime window as the day aggregate', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        paidAmountFen: 100n,
        paidAmountWalletFen: 0n,
        paidAmountBonusFen: 0n,
        paidAmountCardFen: 0n,
        verifyAmountFen: 0n,
        refundAmountFen: 0n,
        orderCount: 1,
        refundOrderCount: 0,
        verifyCount: 0,
        sourceUpdatedAt: '2026-08-04 09:10:11'
      }
    ]);

    const rows = await queryOrderHeaderGmv(
      { $queryRawUnsafe: query } as never,
      '2026-08-03 16:00:00',
      '2026-08-04 16:00:00'
    );

    const [sql, startBound, endBound] = query.mock.calls[0];
    expect(String(sql)).toContain('MAX(datetime(replace(replace("updatedAt"');
    expect(String(sql)).toContain(sqlDatetimeExclusiveRange('"paidTime"'));
    expect(startBound).toBe('2026-08-03 16:00:00');
    expect(endBound).toBe('2026-08-04 16:00:00');
    expect(rows[0]?.sourceUpdatedAt).toBe('2026-08-04 09:10:11');
  });
});
