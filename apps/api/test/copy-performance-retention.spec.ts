import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CopyPerformanceRetentionJob } from '../src/jobs/copy-performance-retention.job';
import {
  COPY_PERFORMANCE_PURGE_BATCH,
  COPY_PERFORMANCE_PURGE_MAX_BATCHES,
  COPY_PERFORMANCE_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('CopyPerformanceRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: CopyPerformanceRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new CopyPerformanceRetentionJob(prisma as never);
  });

  it('exports retention longer than interactive 90d window', () => {
    expect(COPY_PERFORMANCE_RETENTION_DAYS).toBe(180);
    expect(COPY_PERFORMANCE_RETENTION_DAYS).toBeGreaterThan(90);
    expect(COPY_PERFORMANCE_PURGE_BATCH).toBe(2_000);
    expect(COPY_PERFORMANCE_PURGE_MAX_BATCHES).toBe(25);
  });

  it('purgeOlderThan deletes by createdAt with batch limit', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(12);

    const deleted = await job.purgeOlderThan(180, {
      batchSize: 100,
      maxBatches: 5,
      nowMs: Date.parse('2026-07-23T12:00:00Z')
    });

    expect(deleted).toBe(12);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, cutoff, limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM "CopyPerformance"');
    expect(String(sql)).toContain('"id" IN');
    expect(String(sql)).toContain('createdAt');
    expect(cutoff).toBeTruthy();
    expect(limit).toBe(100);
  });

  it('caps at maxBatches', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(50);
    const deleted = await job.purgeOlderThan(30, {
      batchSize: 50,
      maxBatches: 3,
      nowMs: Date.now()
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

    const first = job.purgeExpiredPerformance();
    await job.purgeExpiredPerformance();
    resolveFirst();
    await first;

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
