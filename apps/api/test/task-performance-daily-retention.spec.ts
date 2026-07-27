import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TaskPerformanceDailyRetentionJob } from '../src/jobs/task-performance-daily-retention.job';
import {
  TASK_PERFORMANCE_DAILY_PURGE_BATCH,
  TASK_PERFORMANCE_DAILY_PURGE_MAX_BATCHES,
  TASK_PERFORMANCE_DAILY_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('TaskPerformanceDailyRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: TaskPerformanceDailyRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new TaskPerformanceDailyRetentionJob(prisma as never);
  });

  it('exports retention longer than interactive 90d KPI window', () => {
    expect(TASK_PERFORMANCE_DAILY_RETENTION_DAYS).toBe(180);
    expect(TASK_PERFORMANCE_DAILY_RETENTION_DAYS).toBeGreaterThan(90);
    expect(TASK_PERFORMANCE_DAILY_PURGE_BATCH).toBe(2_000);
    expect(TASK_PERFORMANCE_DAILY_PURGE_MAX_BATCHES).toBe(25);
  });

  it('purgeOlderThan issues batched DELETE by date key + LIMIT', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(7);

    const deleted = await job.purgeOlderThan(180, {
      batchSize: 500,
      maxBatches: 5,
      today: '2026-07-23'
    });

    expect(deleted).toBe(7);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, cutoff, limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM "TaskPerformanceDaily"');
    expect(String(sql)).toContain('"date" < ?');
    expect(String(sql)).toContain('LIMIT ?');
    // 180 calendar days before 2026-07-23 ≈ 2026-01-24
    expect(String(cutoff)).toMatch(/^2026-01-2[34]$/);
    expect(limit).toBe(500);
  });

  it('stops batching when a batch returns fewer rows than batchSize', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(100).mockResolvedValueOnce(12);

    const deleted = await job.purgeOlderThan(90, {
      batchSize: 100,
      maxBatches: 10,
      today: '2026-07-23'
    });

    expect(deleted).toBe(112);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('caps at maxBatches even when every batch is full', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(50);

    const deleted = await job.purgeOlderThan(30, {
      batchSize: 50,
      maxBatches: 3,
      today: '2026-07-23'
    });

    expect(deleted).toBe(150);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
  });

  it('cron entry is overlap-safe', async () => {
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      resolveFirst = r;
    });
    prisma.$executeRawUnsafe.mockImplementationOnce(async () => {
      await firstGate;
      return 0;
    });

    const first = job.purgeExpiredMetrics();
    await job.purgeExpiredMetrics();
    resolveFirst();
    await first;

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
