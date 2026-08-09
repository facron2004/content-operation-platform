import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GeneratedCopyRetentionJob } from '../src/jobs/generated-copy-retention.job';
import { createJobRunnerMock } from './helpers/job-runner';
import {
  GENERATED_COPY_PURGE_BATCH,
  GENERATED_COPY_PURGE_MAX_BATCHES,
  GENERATED_COPY_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('GeneratedCopyRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: GeneratedCopyRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new GeneratedCopyRetentionJob(prisma as never, createJobRunnerMock() as never);
  });

  it('exports retention longer than interactive 90d list window', () => {
    expect(GENERATED_COPY_RETENTION_DAYS).toBe(180);
    expect(GENERATED_COPY_RETENTION_DAYS).toBeGreaterThan(90);
    expect(GENERATED_COPY_PURGE_BATCH).toBe(500);
    expect(GENERATED_COPY_PURGE_MAX_BATCHES).toBe(25);
  });

  it('purgeOlderThan issues batched DELETE excluding approved/reusable', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(7);

    const deleted = await job.purgeOlderThan(180, {
      batchSize: 500,
      maxBatches: 5,
      nowMs: Date.parse('2026-07-23T12:00:00.000Z')
    });

    expect(deleted).toBe(7);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, cutoff, limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM "GeneratedCopy"');
    expect(String(sql)).toContain("auditStatus\" != 'approved'");
    expect(String(sql)).toContain('isReusable');
    expect(String(sql)).toContain('LIMIT ?');
    expect(String(cutoff)).toMatch(/^2026-01-2[34] /);
    expect(limit).toBe(500);
  });

  it('stops batching when a batch returns fewer rows than batchSize', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(100).mockResolvedValueOnce(12);

    const deleted = await job.purgeOlderThan(90, {
      batchSize: 100,
      maxBatches: 10
    });

    expect(deleted).toBe(112);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('caps at maxBatches even when every batch is full', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(50);

    const deleted = await job.purgeOlderThan(30, {
      batchSize: 50,
      maxBatches: 3
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

    const first = job.purgeExpiredCopies();
    await job.purgeExpiredCopies();
    resolveFirst();
    await first;

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
