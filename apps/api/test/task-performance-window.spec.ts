import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERACTIVE_LIST_MAX_DAYS } from '../src/common/list-date-span';
import { getTaskPerformance } from '../src/distribution-task/distribution-task-query';

describe('getTaskPerformance trailing window', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`caps TPD SUM to trailing ${INTERACTIVE_LIST_MAX_DAYS}d and returns dateFrom/dateTo`, async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));

    const queryRaw = vi.fn().mockResolvedValue([
      {
        visitCount: 10,
        orderCount: 2,
        gmvFen: 9950n,
        verifyCount: 1,
        refundCount: 0,
        conversionRate: 0.2
      }
    ]);
    const prisma = { $queryRawUnsafe: queryRaw };

    const result = await getTaskPerformance(prisma as never, 'task-1');

    expect(result).toMatchObject({
      visits: 10,
      orders: 2,
      gmv: 99.5,
      dateFrom: '2026-04-20',
      dateTo: '2026-07-18'
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [sql, taskId, dateFrom, dateTo] = queryRaw.mock.calls[0];
    expect(String(sql)).toContain('TaskPerformanceDaily');
    expect(String(sql)).toContain('"date" >= ?');
    expect(String(sql)).toContain('"date" <= ?');
    expect(taskId).toBe('task-1');
    expect(dateFrom).toBe('2026-04-20');
    expect(dateTo).toBe('2026-07-18');
  });

  it('returns zero rates when orderCount is 0', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        visitCount: 3,
        orderCount: 0,
        gmvFen: 0n,
        verifyCount: 0,
        refundCount: 0,
        conversionRate: 0
      }
    ]);
    const result = await getTaskPerformance({ $queryRawUnsafe: queryRaw } as never, 'task-empty');
    expect(result.verifyRate).toBe(0);
    expect(result.refundRate).toBe(0);
    expect(result.visits).toBe(3);
  });
});
