import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataFreshnessService } from '../src/data-analysis/data-freshness.service';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('DataFreshnessService SQLite UTC timestamps', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes mixed timestamp storage and does not add an Asia/Shanghai 8h lag', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T10:16:54.000Z'));
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ maxTime: null }])
      .mockResolvedValueOnce([{ maxTime: null }])
      .mockResolvedValueOnce([{ maxTime: '2026-08-12 14:16:54' }]);
    const service = new DataFreshnessService({
      $queryRawUnsafe: query
    } as unknown as PrismaService);

    const report = await service.getFreshnessReport();
    const merchant = report.metrics.find((metric) => metric.entity === 'MerchantDailyMetrics');

    expect(query.mock.calls.every(([sql]) => String(sql).includes('MAX(datetime('))).toBe(true);
    expect(merchant).toEqual({
      entity: 'MerchantDailyMetrics',
      lastUpdatedAt: '2026-08-12T14:16:54.000Z',
      lagSeconds: 72_000,
      status: 'healthy'
    });
  });

  it('returns unknown rather than throwing for a malformed source timestamp', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ maxTime: null }])
      .mockResolvedValueOnce([{ maxTime: null }])
      .mockResolvedValueOnce([{ maxTime: 'not-a-date' }]);
    const service = new DataFreshnessService({
      $queryRawUnsafe: query
    } as unknown as PrismaService);

    const report = await service.getFreshnessReport();

    expect(report.metrics[2]).toEqual({
      entity: 'MerchantDailyMetrics',
      lastUpdatedAt: null,
      lagSeconds: null,
      status: 'unknown'
    });
  });
});
