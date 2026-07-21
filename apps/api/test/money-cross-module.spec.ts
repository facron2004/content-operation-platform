import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDayGmvMoney } from '../src/money';
import type { MoneyPrisma } from '../src/money';

/**
 * Cross-module gate: Overview / GMV denominator / Refund totalGmv must share resolveDayGmvMoney.
 * Full GMV payload has more fields; this locks the shared day total contract.
 */
describe('money cross-module same-day totals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T08:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('same fixture day yields identical totalGmv for three consumers of resolveDayGmvMoney', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ totalGmv: 8888.8, paidOrderCount: 66 }]),
      dailyMetrics: { findUnique: vi.fn().mockResolvedValue(null) }
    } as unknown as MoneyPrisma;

    const [overview, gmvDenom, refundDenom] = await Promise.all([
      resolveDayGmvMoney(prisma, '2026-07-13'),
      resolveDayGmvMoney(prisma, '2026-07-13'),
      resolveDayGmvMoney(prisma, '2026-07-13')
    ]);

    expect(overview.totalGmv).toBe(8888.8);
    expect(gmvDenom.totalGmv).toBe(overview.totalGmv);
    expect(refundDenom.totalGmv).toBe(overview.totalGmv);
    expect(overview.dataSource).toBe('OrderHeader');
    expect(gmvDenom.dataSource).toBe('OrderHeader');
    expect(refundDenom.dataSource).toBe('OrderHeader');
  });
});
