import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBeijingToday, resolveDayGmvMoney, shouldPreferOrderHeaderForKpi } from '../src/money';
import type { MoneyPrisma } from '../src/money';

describe('money-resolve policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-07-13 08:00 UTC = Beijing 16:00 → still 2026-07-13 Beijing day
    vi.setSystemTime(new Date('2026-07-13T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats current Beijing day as today for OH preference', () => {
    expect(isBeijingToday('2026-07-13')).toBe(true);
    expect(shouldPreferOrderHeaderForKpi('2026-07-13')).toBe(true);
    expect(shouldPreferOrderHeaderForKpi('2026-07-12')).toBe(false);
  });

  it('today always uses OrderHeader even when zeros', async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValue([{ totalGmvFen: 0n, paidOrderCount: 0, sourceUpdatedAt: null }]),
      dailyMetrics: {
        findUnique: vi.fn().mockResolvedValue({ totalGmvFen: 99_900n, paidOrderCount: 9 })
      }
    } as unknown as MoneyPrisma;

    const result = await resolveDayGmvMoney(prisma, '2026-07-13');
    expect(result).toEqual({
      date: '2026-07-13',
      totalGmvFen: 0n,
      paidOrderCount: 0,
      updatedAt: null,
      dataSource: 'OrderHeader'
    });
    expect(prisma.dailyMetrics.findUnique).not.toHaveBeenCalled();
  });

  it('history prefers DailyMetrics when present', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ totalGmvFen: 100n, paidOrderCount: 1 }]),
      dailyMetrics: {
        findUnique: vi.fn().mockResolvedValue({
          date: '2026-07-01',
          totalGmvFen: 500_000n,
          totalRefundFen: 20_000n,
          paidOrderCount: 40,
          updatedAt: new Date('2026-07-02T03:04:05.000Z')
        })
      }
    } as unknown as MoneyPrisma;

    const result = await resolveDayGmvMoney(prisma, '2026-07-01');
    expect(result.dataSource).toBe('DailyMetrics');
    expect(result.totalGmvFen).toBe(480_000n);
    expect(result.updatedAt).toBe('2026-07-02T03:04:05.000Z');
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.dailyMetrics.findUnique).toHaveBeenCalledWith({
      where: { date: '2026-07-01' },
      select: {
        totalGmvFen: true,
        totalRefundFen: true,
        paidOrderCount: true,
        updatedAt: true
      }
    });
  });

  it('history falls back to OrderHeader when DailyMetrics missing', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          totalGmvFen: 32_100n,
          paidOrderCount: 7,
          sourceUpdatedAt: '2026-06-15 09:08:07'
        }
      ]),
      dailyMetrics: { findUnique: vi.fn().mockResolvedValue(null) }
    } as unknown as MoneyPrisma;

    const result = await resolveDayGmvMoney(prisma, '2026-06-15');
    expect(result).toMatchObject({
      date: '2026-06-15',
      totalGmvFen: 32_100n,
      paidOrderCount: 7,
      updatedAt: '2026-06-15T09:08:07.000Z',
      dataSource: 'OrderHeader'
    });
  });
});
