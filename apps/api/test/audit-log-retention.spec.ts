import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditLogRetentionJob } from '../src/jobs/audit-log-retention.job';
import {
  AUDIT_LOG_PURGE_BATCH,
  AUDIT_LOG_PURGE_MAX_BATCHES,
  AUDIT_LOG_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('AuditLogRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: AuditLogRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new AuditLogRetentionJob(prisma as never);
  });

  it('exports retention longer than interactive 90d list window', () => {
    expect(AUDIT_LOG_RETENTION_DAYS).toBe(180);
    expect(AUDIT_LOG_RETENTION_DAYS).toBeGreaterThan(90);
    expect(AUDIT_LOG_PURGE_BATCH).toBe(2_000);
    expect(AUDIT_LOG_PURGE_MAX_BATCHES).toBe(25);
  });

  it('purgeOlderThan issues batched DELETE with createdAt cutoff + LIMIT', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(7);

    const deleted = await job.purgeOlderThan(180, {
      batchSize: 500,
      maxBatches: 5,
      nowMs: Date.parse('2026-07-23T12:00:00.000Z')
    });

    expect(deleted).toBe(7);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, cutoff, limit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM "OperationAuditLog"');
    expect(String(sql)).toContain('createdAt');
    expect(String(sql)).toContain('LIMIT ?');
    // 180 days before fixed now ≈ 2026-01-24
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

    const first = job.purgeExpiredLogs();
    await job.purgeExpiredLogs();
    resolveFirst();
    await first;

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});

describe('OrderAttribution index DDL (migrations source of truth)', () => {
  it('migration declares taskId+attributedAt composite index', async () => {
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
    expect(sql).toContain('"OrderAttribution_taskId_attributedAt_idx"');
    expect(sql).toMatch(/ON "OrderAttribution"\("taskId", "attributedAt"\)/);
  });
});
