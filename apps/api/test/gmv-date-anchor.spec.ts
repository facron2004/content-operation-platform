import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { TtlCache } from '../src/common';
import { gmvByMerchant, gmvDistribution } from '../src/gmv/gmv.controller';
import { computeMerchantsFromMdMetrics, resolveGmvDistribution } from '../src/gmv/gmv-resolve';
import { createGmvCacheMethods } from '../src/gmv/gmv.service';
import type { GmvService } from '../src/gmv/gmv.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const BUSINESS_DATE = '2026-08-04';
const DAY_START_UTC = '2026-08-03 16:00:00';
const DAY_END_UTC = '2026-08-04 16:00:00';

function request(): Request {
  return { query: {}, user: { roles: [] } } as unknown as Request;
}

describe('GMV selected-date propagation', () => {
  it('passes date through distribution and merchant controller helpers', () => {
    const service = {
      getDistribution: vi.fn(),
      getTopMerchants: vi.fn()
    } as unknown as GmvService;

    gmvDistribution(service, { dim: 'category', limit: 12, date: BUSINESS_DATE }, request());
    gmvByMerchant(
      service,
      { sortBy: 'refundDesc', page: 2, pageSize: 10, date: BUSINESS_DATE },
      request()
    );

    expect(service.getDistribution).toHaveBeenCalledWith('category', 12, false, BUSINESS_DATE);
    expect(service.getTopMerchants).toHaveBeenCalledWith('refundDesc', 2, 10, false, BUSINESS_DATE);
  });

  it('separates recent-7 and selected-day cache entries', async () => {
    const getOrLoad = vi.fn((key: string) =>
      Promise.resolve(
        key.startsWith('gmvMerchants:')
          ? []
          : { items: [], limit: 20, matched: 0, truncated: false }
      )
    );
    const cache = { getOrLoad, clear: vi.fn() } as unknown as TtlCache;
    const prisma = {} as PrismaService;
    const ops = createGmvCacheMethods(cache, prisma);

    await ops.getDistribution('category', 20, false);
    await ops.getDistribution('category', 20, false, BUSINESS_DATE);
    await ops.getTopMerchants('gmvDesc', 1, 20, false);
    await ops.getTopMerchants('gmvDesc', 1, 20, false, BUSINESS_DATE);

    expect(getOrLoad.mock.calls.map(([key]) => key)).toEqual([
      'gmvDist:category:20:recent7',
      `gmvDist:category:20:${BUSINESS_DATE}`,
      'gmvMerchants:gmvDesc:recent7',
      `gmvMerchants:gmvDesc:${BUSINESS_DATE}`
    ]);
  });
});

describe('GMV selected-date query anchors', () => {
  it('binds distribution to one Beijing paidTime day', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ totalGmvFen: 0n }])
      .mockResolvedValueOnce([]);
    const prisma = { $queryRawUnsafe: query } as unknown as PrismaService;

    await resolveGmvDistribution(prisma, 'category', 20, BUSINESS_DATE);

    expect(query).toHaveBeenCalledTimes(2);
    for (const call of query.mock.calls) {
      expect(String(call[0])).toContain('paidTime');
      expect(call.slice(1, 3)).toEqual([DAY_START_UTC, DAY_END_UTC]);
    }
  });

  it('binds MerchantDailyMetrics ranking to exactly the selected date', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as unknown as PrismaService;

    await computeMerchantsFromMdMetrics(prisma, BUSINESS_DATE);

    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('FROM "MerchantDailyMetrics"');
    expect(sql).toContain('paidAmountOnlineFen');
    expect(sql).toContain('paidAmountWalletFen');
    expect(sql).toContain('refundAmountFen');
    expect(query.mock.calls[0]?.slice(1, 3)).toEqual([BUSINESS_DATE, BUSINESS_DATE]);
  });

  it('keeps omitted date on the existing trailing-seven-day windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T04:00:00.000Z'));
    try {
      const distributionQuery = vi
        .fn()
        .mockResolvedValueOnce([{ totalGmvFen: 0n }])
        .mockResolvedValueOnce([]);
      await resolveGmvDistribution(
        { $queryRawUnsafe: distributionQuery } as unknown as PrismaService,
        'category',
        20
      );
      for (const call of distributionQuery.mock.calls) {
        expect(call.slice(1, 3)).toEqual(['2026-08-05 16:00:00', '2026-08-12 16:00:00']);
      }

      const merchantQuery = vi.fn().mockResolvedValue([]);
      await computeMerchantsFromMdMetrics({
        $queryRawUnsafe: merchantQuery
      } as unknown as PrismaService);
      expect(merchantQuery.mock.calls[0]?.slice(1, 3)).toEqual(['2026-08-06', '2026-08-12']);
    } finally {
      vi.useRealTimers();
    }
  });
});
