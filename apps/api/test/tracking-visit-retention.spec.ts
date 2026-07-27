import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TrackingVisitRetentionJob } from '../src/jobs/tracking-visit-retention.job';
import {
  TRACKING_VISIT_PURGE_BATCH,
  TRACKING_VISIT_PURGE_MAX_BATCHES,
  TRACKING_VISIT_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('TrackingVisitRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: TrackingVisitRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new TrackingVisitRetentionJob(prisma as never);
  });

  it('exports retention constants aligned with interactive 90d cap', () => {
    expect(TRACKING_VISIT_RETENTION_DAYS).toBe(90);
    expect(TRACKING_VISIT_PURGE_BATCH).toBeGreaterThan(0);
    expect(TRACKING_VISIT_PURGE_MAX_BATCHES).toBeGreaterThan(0);
  });

  it('purgeOlderThan issues batched DELETE with visitTime cutoff + LIMIT', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(3);

    const deleted = await job.purgeOlderThan(90, {
      batchSize: 500,
      maxBatches: 5,
      nowMs: Date.parse('2026-07-23T12:00:00.000Z')
    });

    expect(deleted).toBe(3);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, cutoff, limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM "TrackingVisit"');
    expect(String(sql)).toContain('visitTime');
    expect(String(sql)).toContain('LIMIT ?');
    // 90 days before fixed now
    expect(String(cutoff)).toMatch(/^2026-04-24 /);
    expect(limit).toBe(500);
  });

  it('stops batching when a batch returns fewer rows than batchSize', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(100).mockResolvedValueOnce(40);

    const deleted = await job.purgeOlderThan(30, {
      batchSize: 100,
      maxBatches: 10
    });

    expect(deleted).toBe(140);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('caps at maxBatches even when every batch is full', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(50);

    const deleted = await job.purgeOlderThan(7, {
      batchSize: 50,
      maxBatches: 3
    });

    expect(deleted).toBe(150);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
  });

  it('clamps invalid retentionDays / batch sizes to safe floors', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(0);

    await job.purgeOlderThan(0, { batchSize: 0, maxBatches: 0 });

    const [, , limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(limit).toBe(1);
    // Only one batch after maxBatches clamp
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('cron entry reuses default retention and is overlap-safe', async () => {
    prisma.$executeRawUnsafe.mockResolvedValue(0);
    // Concurrent cron ticks while first still running should no-op.
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      resolveFirst = r;
    });
    prisma.$executeRawUnsafe.mockImplementationOnce(async () => {
      await firstGate;
      return 0;
    });

    const first = job.purgeExpiredVisits();
    // Second call while running=true should skip without extra SQL.
    await job.purgeExpiredVisits();
    resolveFirst();
    await first;

    // First path only (second skipped before SQL)
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});

describe('TrackingVisit index DDL (migrations source of truth)', () => {
  it('migration declares composite code+visitTime and visitTime indexes', async () => {
    // VNext DB-003: seed-data 手写 DDL 已废弃，索引真源为 prisma/migrations。
    const fs = await import('fs/promises');
    const path = await import('path');
    const migPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'prisma',
      'migrations',
      '0001_init',
      'migration.sql'
    );
    const sql = await fs.readFile(migPath, 'utf8');
    expect(sql).toContain('"TrackingVisit_trackingCode_visitTime_idx"');
    expect(sql).toMatch(/ON "TrackingVisit"\("trackingCode", "visitTime"\)/);
    expect(sql).toContain('"TrackingVisit_visitTime_idx"');
  });
});
