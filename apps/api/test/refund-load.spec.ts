import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/common';
import { createRefundServiceSurface, loadVerifyTrend } from '../src/refund/refund-load';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('refund top-merchants cache scope', () => {
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

  it('floors net GMV at 0 on the OrderHeader path (today card + merchant gmv)', async () => {
    let call = 0;
    const prisma = {
      $queryRawUnsafe: vi.fn(async () => {
        call += 1;
        if (call === 1) return [{ totalGmvFen: -500n, paidOrderCount: 1 }]; // 净GMV为负
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

    // 今日的净 GMV 与商家 gmv 都不应为负
    expect(today.totalGmv).toBe(0);
    expect(today.topRefundMerchants[0]?.gmv).toBe(0);
    // 退款金额仍如实展示
    expect(today.totalRefund).toBe(1);
    expect(today.topRefundMerchants[0]?.refund).toBe(1);
  });
});
