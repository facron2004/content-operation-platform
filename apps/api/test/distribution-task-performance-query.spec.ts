import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTaskKpi } from '../src/distribution-task/distribution-task-performance-query';

describe('distribution-task performance queries', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps KPI aggregation in fen and exposes yuan at the API boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T10:00:00+08:00'));

    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        { todayPending: 2, inProgress: 3, completed: 4, overdue: 1, failed: 0 }
      ])
      .mockResolvedValueOnce([{ todayTaskGmvFen: 12345n }]);

    const result = await getTaskKpi({ $queryRawUnsafe: queryRaw } as never);

    expect(result).toEqual({
      todayPending: 2,
      inProgress: 3,
      completed: 4,
      overdue: 1,
      failed: 0,
      todayTaskGmv: 123.45
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(String(queryRaw.mock.calls[1][0])).toContain('TaskPerformanceDaily');
    expect(String(queryRaw.mock.calls[1][0])).toContain('"gmvFen"');
    expect(queryRaw.mock.calls[1][1]).toBe('2026-08-08');
  });
});
