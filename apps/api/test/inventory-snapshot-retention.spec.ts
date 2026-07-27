import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InventorySnapshotRetentionJob } from '../src/jobs/inventory-snapshot-retention.job';
import {
  INVENTORY_SNAPSHOT_PURGE_BATCH,
  INVENTORY_SNAPSHOT_PURGE_MAX_BATCHES,
  INVENTORY_SNAPSHOT_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('InventorySnapshotRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: InventorySnapshotRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new InventorySnapshotRetentionJob(prisma as never);
  });

  it('exports retention matching interactive 90d timeline window', () => {
    expect(INVENTORY_SNAPSHOT_RETENTION_DAYS).toBe(90);
    expect(INVENTORY_SNAPSHOT_PURGE_BATCH).toBe(2_000);
    expect(INVENTORY_SNAPSHOT_PURGE_MAX_BATCHES).toBe(25);
  });

  it('purgeOlderThan issues batched DELETE with snapshotDate cutoff + LIMIT', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(7);

    const deleted = await job.purgeOlderThan(90, {
      batchSize: 500,
      maxBatches: 5,
      today: '2026-07-23'
    });

    expect(deleted).toBe(7);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, cutoff, limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM "JeeSiteInventoryDailySnapshot"');
    expect(String(sql)).toContain('snapshotDate');
    expect(String(sql)).toContain('LIMIT ?');
    // 90 days before 2026-07-23 → 2026-04-24
    expect(cutoff).toBe('2026-04-24');
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

    const first = job.purgeExpiredSnapshots();
    await job.purgeExpiredSnapshots();
    resolveFirst();
    await first;

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
