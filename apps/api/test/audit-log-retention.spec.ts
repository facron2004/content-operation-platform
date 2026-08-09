import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AuditLogRetentionJob } from '../src/jobs/audit-log-retention.job';
import { createJobRunnerMock } from './helpers/job-runner';
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
    job = new AuditLogRetentionJob(prisma as never, createJobRunnerMock() as never);
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
  it('migration creates the taskId+attributedAt composite index', async () => {
    const root = join(__dirname, '..', '..', '..');
    const tempDir = join(root, '.tmp-test-db');
    const databasePath = join(tempDir, 'audit-migration.db');
    mkdirSync(tempDir, { recursive: true });
    rmSync(databasePath, { force: true });
    const client = createClient({ url: `file:${databasePath.replaceAll('\\', '/')}` });
    try {
      const migration = readFileSync(
        join(__dirname, '..', '..', '..', 'prisma', 'migrations', '0001_init', 'migration.sql'),
        'utf8'
      );
      await client.executeMultiple(migration);
      const result = await client.execute({
        sql: `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = ?`,
        args: ['OrderAttribution_taskId_attributedAt_idx']
      });
      expect(result.rows).toHaveLength(1);
      expect(String(result.rows[0].sql)).toContain(
        'ON "OrderAttribution"("taskId", "attributedAt")'
      );
    } finally {
      await client.close();
    }
  });
});
