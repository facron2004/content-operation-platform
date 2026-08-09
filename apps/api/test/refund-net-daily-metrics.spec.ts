import { describe, expect, it, vi } from 'vitest';
import {
  buildRefundTrendPoints,
  buildVerifyTrendPoints,
  refundTodayFromDailyMetrics,
  verifyTodayFromDailyMetrics
} from '../src/refund/refund-daily-metrics';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('DailyMetrics net GMV read projections', () => {
  it('recomputes refund and verify trend rates from paid order counts', () => {
    const refundTrend = buildRefundTrendPoints(
      [
        {
          date: '2026-07-31',
          totalGmvFen: 10000n,
          totalRefundFen: 2000n,
          refundRate: 0.2,
          refundCount: 1,
          paidOrderCount: 2
        }
      ],
      '2026-07-31',
      1
    );
    const verifyTrend = buildVerifyTrendPoints(
      [
        {
          date: '2026-07-31',
          totalGmvFen: 10000n,
          totalRefundFen: 2000n,
          totalVerifyFen: 5000n,
          verifyRate: 0.5,
          verifyCount: 1,
          paidOrderCount: 2
        }
      ],
      '2026-07-31',
      1
    );

    expect(refundTrend[0]).toMatchObject({ refundRate: 0.5 });
    expect(verifyTrend[0]).toMatchObject({ verifyRate: 0.5 });
  });

  it('returns net GMV for historical today projections', async () => {
    const prisma = {
      dailyMetrics: {
        findUnique: vi.fn().mockResolvedValue({
          date: '2026-07-31',
          totalGmvFen: 10000n,
          totalRefundFen: 2000n,
          refundRate: 0.2,
          refundCount: 1,
          totalVerifyFen: 5000n,
          verifyRate: 0.5,
          verifyCount: 1,
          paidOrderCount: 2,
          updatedAt: new Date('2026-07-31T00:00:00Z')
        })
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([])
    } as unknown as PrismaService;

    const refund = await refundTodayFromDailyMetrics(prisma, '2026-07-31');
    const verify = await verifyTodayFromDailyMetrics(prisma, '2026-07-31');

    expect(refund).toMatchObject({ totalGmv: 80, refundRate: 0.5 });
    expect(verify).toMatchObject({ totalGmv: 80, verifyRate: 0.5 });
  });
});
