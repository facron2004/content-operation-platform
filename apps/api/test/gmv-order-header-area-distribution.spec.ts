import { describe, expect, it, vi } from 'vitest';
import { loadOrderHeaderAreaDistribution } from '../src/gmv/gmv-order-header.query';

function areaRow(overrides: Partial<Record<string, unknown>>) {
  return {
    key: '深圳市',
    merchantId: 'merchant-1',
    lat: 22.548,
    lng: 114.131,
    gmvFen: 1000n,
    gmvOnlineFen: 800n,
    gmvWalletFen: 150n,
    gmvBonusFen: 50n,
    refundFen: 0n,
    ...overrides
  };
}

describe('GMV coordinate area distribution', () => {
  it('aggregates by nearest Shenzhen district and keeps fallback coordinates unclassified', async () => {
    const queryRawUnsafe = vi
      .fn()
      .mockResolvedValueOnce([{ totalGmvFen: 3000n }])
      .mockResolvedValueOnce([
        areaRow({ merchantId: 'luohu', gmvFen: 1000n }),
        areaRow({ merchantId: 'futian', lat: 22.521, lng: 114.055, gmvFen: 500n }),
        areaRow({
          merchantId: 'fallback',
          lat: 22.543,
          lng: 114.058,
          gmvFen: 1500n,
          gmvOnlineFen: 1200n,
          gmvWalletFen: 200n,
          gmvBonusFen: 100n
        })
      ]);

    const result = await loadOrderHeaderAreaDistribution(
      { $queryRawUnsafe: queryRawUnsafe } as never,
      '2026-08-15 16:00:00',
      '2026-08-16 16:00:00',
      10
    );

    expect(result.totalGmvFen).toBe(3000n);
    expect(result.rows).toEqual([
      expect.objectContaining({ key: '未分区', gmvFen: 1500n }),
      expect.objectContaining({ key: '罗湖区', gmvFen: 1000n }),
      expect.objectContaining({ key: '福田区', gmvFen: 500n })
    ]);
    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
