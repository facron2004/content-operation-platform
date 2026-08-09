import { createClient, type InValue } from '@libsql/client';
import { describe, it, expect, vi } from 'vitest';
import { JobRunnerService } from '../src/jobs/job-runner.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { IdempotencyService } from '../src/idempotency/idempotency.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('JobRunner and Outbox Services Unit Tests', () => {
  it('JobRunnerService catches errors and updates JobRun with failed status', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn()
    } as unknown as PrismaService;

    const runner = new JobRunnerService(mockPrisma);

    await runner.runJob('failing-job', async () => {
      throw new Error('Database connection failed');
    });

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "JobRun"'),
      expect.any(String),
      expect.any(Number),
      'Database connection failed',
      null,
      expect.any(String)
    );
  });

  it('does not execute a job when its initial JobRun cannot be recorded', async () => {
    const persistenceError = new Error('JobRun table unavailable');
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockRejectedValue(persistenceError),
      $queryRawUnsafe: vi.fn()
    } as unknown as PrismaService;
    const runner = new JobRunnerService(mockPrisma);
    const jobFn = vi.fn().mockResolvedValue(1);

    await expect(runner.runJob('untracked-job', jobFn)).rejects.toBe(persistenceError);

    expect(jobFn).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('persists initial metadata before executing a job', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn()
    } as unknown as PrismaService;
    const runner = new JobRunnerService(mockPrisma);
    const initialMeta = {
      refreshJobId: 'refresh-1',
      startDate: '2026-08-01',
      endDate: '2026-08-09'
    };

    await runner.runJob('gmv-refresh', async () => 0, initialMeta);

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('"metaJson"'),
      expect.any(String),
      'gmv-refresh',
      expect.any(String),
      JSON.stringify(initialMeta)
    );
  });

  it('persists the latest running metadata checkpoint before final status', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const mockPrisma = {
      $executeRawUnsafe: executeRaw,
      $queryRawUnsafe: vi.fn()
    } as unknown as PrismaService;
    const runner = new JobRunnerService(mockPrisma);
    const initialMeta = { refreshJobId: 'refresh-2', startDate: '2026-08-01' };

    await runner.runJob(
      'gmv-refresh',
      async (setMeta) => {
        setMeta({ pagesFetched: 1, upserted: 10 });
        setMeta({ pagesFetched: 2, upserted: 20 });
        return 20;
      },
      initialMeta,
      { persistMeta: true }
    );

    expect(executeRaw).toHaveBeenCalledTimes(3);
    expect(executeRaw.mock.calls[1][0]).toContain(`WHERE "id" = ? AND "status" = 'running'`);
    expect(executeRaw.mock.calls[1][1]).toBe(
      JSON.stringify({ ...initialMeta, pagesFetched: 2, upserted: 20 })
    );
    expect(executeRaw.mock.calls[2][0]).toContain('SET "status" = \'success\'');
  });

  it('surfaces a failed-status persistence error instead of swallowing it', async () => {
    const statusError = new Error('JobRun update unavailable');
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(statusError),
      $queryRawUnsafe: vi.fn()
    } as unknown as PrismaService;
    const runner = new JobRunnerService(mockPrisma);

    await expect(
      runner.runJob('unpersisted-failure', async () => {
        throw new Error('payload failed');
      })
    ).rejects.toBe(statusError);

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('recovers stale running jobs as interrupted on module initialization', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(2),
      $queryRawUnsafe: vi.fn()
    } as unknown as PrismaService;

    await new JobRunnerService(mockPrisma).onModuleInit();

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('SET "status" = \'interrupted\''),
      expect.any(String),
      '进程异常退出，任务被中断；仅幂等任务允许重试'
    );
  });

  it('returns the latest JobRun per job with deterministic tie-breaking', async () => {
    const client = createClient({ url: 'file::memory:?cache=shared' });
    await client.execute(`
      CREATE TABLE "JobRun" (
        "id" TEXT PRIMARY KEY,
        "jobName" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "startedAt" TEXT NOT NULL,
        "durationMs" INTEGER,
        "errorMessage" TEXT
      )
    `);
    const rows: Array<[string, string, string, string, number | null, string | null]> = [
      ['job_a_001', 'job-a', 'failed', '2026-08-01 00:00:00', 10, 'old failure'],
      ['job_a_002', 'job-a', 'success', '2026-08-02 00:00:00', 20, null],
      ['job_b_001', 'job-b', 'failed', '2026-08-03 00:00:00', 1, 'first failure'],
      ['job_b_002', 'job-b', 'interrupted', '2026-08-03 00:00:00', null, 'latest interruption']
    ];
    for (const row of rows) {
      await client.execute({
        sql: `INSERT INTO "JobRun" ("id", "jobName", "status", "startedAt", "durationMs", "errorMessage")
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: row
      });
    }

    const prisma = {
      $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
        (await client.execute({ sql, args })).rows as T
    } as unknown as PrismaService;

    try {
      await expect(new JobRunnerService(prisma).getJobStatuses()).resolves.toEqual([
        {
          jobName: 'job-a',
          lastStatus: 'success',
          lastRunAt: '2026-08-02 00:00:00',
          lastDurationMs: 20,
          lastErrorMessage: null
        },
        {
          jobName: 'job-b',
          lastStatus: 'interrupted',
          lastRunAt: '2026-08-03 00:00:00',
          lastDurationMs: null,
          lastErrorMessage: 'latest interruption'
        }
      ]);
    } finally {
      await client.close();
    }
  });

  it('finds the latest JobRun by an exact JSON metadata value', async () => {
    const client = createClient({ url: 'file::memory:?cache=shared' });
    await client.execute('DROP TABLE IF EXISTS "JobRun"');
    await client.execute(`
      CREATE TABLE "JobRun" (
        "id" TEXT PRIMARY KEY,
        "jobName" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "startedAt" TEXT NOT NULL,
        "finishedAt" TEXT,
        "durationMs" INTEGER,
        "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
        "errorMessage" TEXT,
        "metaJson" TEXT,
        "createdAt" TEXT NOT NULL
      )
    `);
    await client.execute({
      sql: `INSERT INTO "JobRun"
            ("id", "jobName", "status", "startedAt", "metaJson", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'refresh_old',
        'gmv-refresh',
        'interrupted',
        '2026-08-09 01:00:00',
        JSON.stringify({
          refreshJobId: 'refresh-1',
          startDate: '2026-08-01',
          endDate: '2026-08-09'
        }),
        '2026-08-09 01:00:00'
      ]
    });
    await client.execute({
      sql: `INSERT INTO "JobRun"
            ("id", "jobName", "status", "startedAt", "metaJson", "createdAt")
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'refresh_new',
        'gmv-refresh',
        'success',
        '2026-08-09 02:00:00',
        JSON.stringify({
          refreshJobId: 'refresh-1',
          startDate: '2026-08-01',
          endDate: '2026-08-09'
        }),
        '2026-08-09 02:00:00'
      ]
    });

    const prisma = {
      $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
        (await client.execute({ sql, args })).rows as T
    } as unknown as PrismaService;

    try {
      await expect(
        new JobRunnerService(prisma).findLatestByMeta('gmv-refresh', 'refreshJobId', 'refresh-1')
      ).resolves.toMatchObject({ id: 'refresh_new', status: 'success' });
      await expect(
        new JobRunnerService(prisma).findLatestByMeta('gmv-refresh', 'bad-key', 'refresh-1')
      ).rejects.toThrow('Invalid JobRun metadata key');
    } finally {
      await client.close();
    }
  });

  it('OutboxService constructs correctly formatted pending events', async () => {
    const mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    } as unknown as PrismaService;

    const outbox = new OutboxService(mockPrisma);
    const eventId = await outbox.publishEvent(mockPrisma, 'Task', 'task-100', 'Published', {
      by: 'user-1'
    });

    expect(eventId).toMatch(/^evt_/);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "OutboxEvent"'),
      eventId,
      'Task',
      'task-100',
      'Published',
      JSON.stringify({ by: 'user-1' })
    );
  });

  it('OutboxService fetches only the public event projection', async () => {
    const client = createClient({ url: 'file::memory:?cache=shared' });
    await client.execute(`
      CREATE TABLE "OutboxEvent" (
        "id" TEXT PRIMARY KEY,
        "aggregateType" TEXT NOT NULL,
        "aggregateId" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "payloadJson" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "retryCount" INTEGER NOT NULL,
        "errorMessage" TEXT,
        "createdAt" TEXT NOT NULL,
        "processedAt" TEXT,
        "internalToken" TEXT
      )
    `);
    await client.execute({
      sql: `INSERT INTO "OutboxEvent"
            ("id", "aggregateType", "aggregateId", "eventType", "payloadJson", "status", "retryCount", "createdAt", "internalToken")
            VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      args: [
        'evt_projection',
        'Task',
        'task-100',
        'Published',
        '{"by":"user-1"}',
        '2026-08-04 00:00:00',
        'must-not-leak'
      ]
    });

    const prisma = {
      $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
        (await client.execute({ sql, args })).rows as T
    } as unknown as PrismaService;

    try {
      const [event] = await new OutboxService(prisma).fetchPending();
      expect(event).toEqual({
        id: 'evt_projection',
        aggregateType: 'Task',
        aggregateId: 'task-100',
        eventType: 'Published',
        payloadJson: '{"by":"user-1"}',
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        createdAt: '2026-08-04 00:00:00',
        processedAt: null
      });
      expect(event).not.toHaveProperty('internalToken');
    } finally {
      await client.close();
    }
  });

  it('IdempotencyService finds only the public record projection', async () => {
    const client = createClient({ url: 'file::memory:?cache=shared' });
    await client.execute(`
      CREATE TABLE "IdempotencyRecord" (
        "id" TEXT PRIMARY KEY,
        "idempotencyKey" TEXT NOT NULL,
        "operationType" TEXT NOT NULL,
        "requestHash" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "responseData" TEXT,
        "expiresAt" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        "internalToken" TEXT
      )
    `);
    await client.execute({
      sql: `INSERT INTO "IdempotencyRecord"
            ("id", "idempotencyKey", "operationType", "requestHash", "status", "responseData", "expiresAt", "createdAt", "updatedAt", "internalToken")
            VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
      args: [
        'idem_projection',
        'request-1',
        'Task:create',
        'hash-1',
        '{"ok":true}',
        '2099-01-01T00:00:00.000Z',
        '2026-08-04 00:00:00',
        '2026-08-04 00:00:00',
        'must-not-leak'
      ]
    });

    const prisma = {
      $queryRawUnsafe: async <T = unknown>(sql: string, ...args: InValue[]) =>
        (await client.execute({ sql, args })).rows as T,
      $executeRawUnsafe: vi.fn()
    } as unknown as PrismaService;

    try {
      const record = await new IdempotencyService(prisma).findRecord('request-1', 'Task:create');
      expect(record).toMatchObject({
        id: 'idem_projection',
        idempotencyKey: 'request-1',
        operationType: 'Task:create',
        requestHash: 'hash-1',
        status: 'completed',
        responseData: '{"ok":true}'
      });
      expect(record).not.toHaveProperty('internalToken');
    } finally {
      await client.close();
    }
  });

  it('treats only unique-key errors as idempotency races', async () => {
    const uniqueError = new Error('UNIQUE constraint failed: IdempotencyRecord.idempotencyKey');
    const prisma = {
      $executeRawUnsafe: vi.fn().mockRejectedValue(uniqueError)
    } as unknown as PrismaService;

    await expect(
      new IdempotencyService(prisma).tryCreate('request-1', 'Task:create', 'hash-1')
    ).resolves.toBeNull();
  });

  it('surfaces non-unique idempotency persistence failures', async () => {
    const persistenceError = new Error('database is locked');
    const prisma = {
      $executeRawUnsafe: vi.fn().mockRejectedValue(persistenceError)
    } as unknown as PrismaService;

    await expect(
      new IdempotencyService(prisma).tryCreate('request-2', 'Task:create', 'hash-2')
    ).rejects.toBe(persistenceError);
  });

  it('atomically reacquires only a failed idempotency record', async () => {
    const executeRaw = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const prisma = { $executeRawUnsafe: executeRaw } as unknown as PrismaService;
    const service = new IdempotencyService(prisma);

    await expect(service.tryAcquireFailed('idem-failed')).resolves.toBe(true);
    await expect(service.tryAcquireFailed('idem-failed')).resolves.toBe(false);

    expect(String(executeRaw.mock.calls[0]?.[0])).toContain(`"status" = 'failed'`);
    expect(executeRaw.mock.calls[0]?.[1]).toBe('idem-failed');
  });

  it('hashes equivalent JSON payloads independently of object key order', () => {
    const prisma = {} as PrismaService;
    const service = new IdempotencyService(prisma);

    expect(service.hashRequest({ title: 'A', nested: { z: 1, a: 2 } })).toBe(
      service.hashRequest({ nested: { a: 2, z: 1 }, title: 'A' })
    );
  });

  it('purges same-day expired ISO timestamps without deleting future records', async () => {
    const client = createClient({ url: 'file::memory:?cache=shared' });
    await client.execute('DROP TABLE IF EXISTS "IdempotencyRecord"');
    await client.execute(`
      CREATE TABLE "IdempotencyRecord" (
        "id" TEXT PRIMARY KEY,
        "expiresAt" TEXT NOT NULL
      )
    `);
    await client.execute({
      sql: `INSERT INTO "IdempotencyRecord" ("id", "expiresAt") VALUES (?, ?), (?, ?)`,
      args: [
        'expired',
        new Date(Date.now() - 60_000).toISOString(),
        'future',
        new Date(Date.now() + 60_000).toISOString()
      ]
    });
    const prisma = {
      $executeRawUnsafe: async (sql: string, ...args: InValue[]) =>
        (await client.execute({ sql, args })).rowsAffected
    } as unknown as PrismaService;

    try {
      await expect(new IdempotencyService(prisma).purgeExpired()).resolves.toBe(1);
      const remaining = await client.execute(`SELECT "id" FROM "IdempotencyRecord" ORDER BY "id"`);
      expect(remaining.rows.map((row) => row.id)).toEqual(['future']);
    } finally {
      await client.close();
    }
  });
});
