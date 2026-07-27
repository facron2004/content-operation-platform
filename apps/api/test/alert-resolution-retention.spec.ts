import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AlertResolutionRetentionJob } from '../src/jobs/alert-resolution-retention.job';
import {
  ALERT_RESOLUTION_PURGE_BATCH,
  ALERT_RESOLUTION_PURGE_MAX_BATCHES,
  ALERT_RESOLUTION_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('AlertResolutionRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: AlertResolutionRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new AlertResolutionRetentionJob(prisma as never);
  });

  it('exports retention matching interactive day-scoped resolve window family', () => {
    expect(ALERT_RESOLUTION_RETENTION_DAYS).toBe(90);
    expect(ALERT_RESOLUTION_PURGE_BATCH).toBe(2_000);
    expect(ALERT_RESOLUTION_PURGE_MAX_BATCHES).toBe(25);
  });

  it('purgeOlderThan issues batched DELETE by resolvedDate + LIMIT', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(7);

    const deleted = await job.purgeOlderThan(90, {
      batchSize: 500,
      maxBatches: 5,
      today: '2026-07-23'
    });

    expect(deleted).toBe(7);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, cutoff, limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM "OperationAlertResolution"');
    expect(String(sql)).toContain('"resolvedDate" < ?');
    expect(String(sql)).toContain('LIMIT ?');
    // 90 calendar days before 2026-07-23 ≈ 2026-04-24
    expect(String(cutoff)).toMatch(/^2026-04-2[34]$/);
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

    const first = job.purgeExpiredResolutions();
    await job.purgeExpiredResolutions();
    resolveFirst();
    await first;

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
