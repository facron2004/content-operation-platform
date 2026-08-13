import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/common';
import {
  aggregateRefundTrendByBucket,
  aggregateVerifyTrendByBucket,
  createRefundServiceSurface,
  loadVerifyTrend
} from '../src/refund/refund-load';
import { computeVerifyFromOrderHeader } from '../src/refund/refund-order-header';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('refund top-merchants cache scope', () => {
  it('keeps aggregated refund and verify rates on the shared four-decimal precision', () => {
    const base = [
      {
        date: '2026-08-10',
        totalRefund: 1,
        totalGmv: 10,
        refundRate: 1,
        refundCount: 1,
        paidOrderCount: 1
      },
      {
        date: '2026-08-11',
        totalRefund: 0,
        totalGmv: 20,
        refundRate: 0,
        refundCount: 0,
        paidOrderCount: 2
      }
    ];
    expect(aggregateRefundTrendByBucket(base, 'week')[0]?.refundRate).toBe(0.3333);
    expect(
      aggregateVerifyTrendByBucket(
        base.map((point) => ({
          date: point.date,
          totalVerify: point.date.endsWith('10') ? 1 : 0,
          verifyRate: point.refundRate,
          verifyCount: point.refundCount,
          paidOrderCount: point.paidOrderCount
        })),
        'week'
      )[0]?.verifyRate
    ).toBe(0.3333);
  });

  it('does not reuse a ranking across different anchor dates', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn(async (_sql: string, ...args: unknown[]) => {
        const date = String(args[0]).slice(0, 10);
        return [
          {
            merchantId: `merchant-${date}`,
            merchantName: date,
            gmvFen: 10_000n,
            refundFen: 1_000n,
            verifyFen: 0n,
            paidOrderCount: 1,
            refundCount: 1,
            verifyCount: 0
          }
        ];
      })
    } as unknown as PrismaService;
    const surface = createRefundServiceSurface(prisma, new TtlCache(60_000));

    const first = await surface.getTopMerchants({
      sortBy: 'refundDesc',
      page: 1,
      pageSize: 20,
      window: 'day',
      date: '2026-07-01'
    });
    const sameDate = await surface.getTopMerchants({
      sortBy: 'refundDesc',
      page: 1,
      pageSize: 20,
      window: 'day',
      date: '2026-07-01'
    });
    const second = await surface.getTopMerchants({
      sortBy: 'refundDesc',
      page: 1,
      pageSize: 20,
      window: 'day',
      date: '2026-07-02'
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(sameDate.items[0]?.merchantName).toBe(first.items[0]?.merchantName);
    expect(second.items[0]?.merchantName).not.toBe(first.items[0]?.merchantName);
  });

  it('bypasses the stored refund ranking only when force is explicitly requested', async () => {
    let version = 0;
    const prisma = {
      $queryRawUnsafe: vi.fn(async () => {
        version += 1;
        return [
          {
            merchantId: `merchant-${version}`,
            merchantName: `merchant-${version}`,
            gmvFen: 10_000n,
            refundFen: 1_000n,
            verifyFen: 0n,
            paidOrderCount: 1,
            refundCount: 1,
            verifyCount: 0
          }
        ];
      })
    } as unknown as PrismaService;
    const surface = createRefundServiceSurface(prisma, new TtlCache(60_000));
    const query = {
      sortBy: 'refundDesc' as const,
      page: 1,
      pageSize: 20,
      window: 'day' as const,
      date: '2026-07-01'
    };

    const first = await surface.getTopMerchants(query);
    const cached = await surface.getTopMerchants(query);
    const forced = await surface.getTopMerchants(query, true);

    expect(first.items[0]?.merchantName).toBe('merchant-1');
    expect(cached.items[0]?.merchantName).toBe('merchant-1');
    expect(forced.items[0]?.merchantName).toBe('merchant-2');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('uses OrderHeader paidTime as the verify trend primary source', async () => {
    const dailyMetrics = { findMany: vi.fn() };
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          date: '2026-07-31',
          totalVerifyFen: 5000n,
          verifyCount: 1,
          paidOrderCount: 2
        }
      ]),
      dailyMetrics
    } as unknown as PrismaService;

    const rows = await loadVerifyTrend(prisma, new TtlCache(60_000), {
      days: 7,
      endDate: '2026-07-31',
      bucket: 'day'
    });

    expect(rows.find((row) => row.date === '2026-07-31')).toMatchObject({
      totalVerify: 50,
      verifyRate: 0.5,
      verifyCount: 1,
      paidOrderCount: 2
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(dailyMetrics.findMany).not.toHaveBeenCalled();
  });

  it('falls back to DailyMetrics when the OrderHeader verify trend is empty', async () => {
    const dailyMetrics = {
      findMany: vi.fn().mockResolvedValue([
        {
          date: '2026-07-31',
          totalVerifyFen: 5000n,
          totalGmvFen: 10000n,
          totalRefundFen: 0n,
          verifyRate: 0.5,
          verifyCount: 1,
          paidOrderCount: 2
        }
      ])
    };
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      dailyMetrics
    } as unknown as PrismaService;

    const rows = await loadVerifyTrend(prisma, new TtlCache(60_000), {
      days: 7,
      endDate: '2026-07-31',
      bucket: 'day'
    });

    expect(rows.find((row) => row.date === '2026-07-31')).toMatchObject({
      totalVerify: 50,
      verifyRate: 0.5,
      verifyCount: 1,
      paidOrderCount: 2
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(dailyMetrics.findMany).toHaveBeenCalledTimes(1);
  });

  it('preserves signed net GMV on the OrderHeader path (today card + merchant gmv)', async () => {
    let call = 0;
    const prisma = {
      $queryRawUnsafe: vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return [
            {
              totalGmvFen: -500n,
              paidOrderCount: 1,
              sourceUpdatedAt: '2026-08-10 12:34:56'
            }
          ];
        }
        if (call === 2) return [{ totalRefundFen: 100n, refundCount: 1 }];
        // 高退款商家: gmvFen 为负 (退款>已确认销售额)
        return [
          {
            merchantId: 'm1',
            merchantName: '负净GMV商家',
            gmvFen: -500n,
            refundFen: 100n,
            verifyFen: 0n,
            paidOrderCount: 1,
            refundCount: 1,
            verifyCount: 0
          }
        ];
      })
    } as unknown as PrismaService;

    const today = await createRefundServiceSurface(prisma, new TtlCache(60_000)).getRefundToday({
      date: '2026-08-10', // 今日走 OH 实时路径
      window: 'day'
    });

    // 负净 GMV 是对账信号，不应在分析接口被截断。
    expect(today.totalGmv).toBe(-5);
    expect(today.topRefundMerchants[0]?.gmv).toBe(-5);
    // 退款金额仍如实展示
    expect(today.totalRefund).toBe(1);
    expect(today.topRefundMerchants[0]?.refund).toBe(1);
    expect(today.updatedAt).toBe('2026-08-10T12:34:56.000Z');
  });

  it('returns null source updatedAt when the OrderHeader window has no source timestamp', async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([{ totalGmvFen: 0n, paidOrderCount: 0, sourceUpdatedAt: null }])
        .mockResolvedValueOnce([{ totalVerifyFen: 0n, verifyCount: 0 }])
    } as unknown as PrismaService;

    const today = await computeVerifyFromOrderHeader(
      prisma,
      { start: '2026-08-10', end: '2026-08-10' },
      async () => []
    );

    expect(today.updatedAt).toBeNull();
  });
});
