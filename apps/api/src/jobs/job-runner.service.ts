import { Injectable, Inject, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newEntityId } from '../common/id';
import { toSqliteDateTime } from '../common/sqlite-datetime';

export interface JobRunRecord {
  id: string;
  jobName: string;
  status: 'running' | 'success' | 'failed' | 'interrupted';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  itemsProcessed: number;
  errorMessage: string | null;
  metaJson: string | null;
  createdAt: string;
}

export interface JobRunnerRunOptions {
  /** Persist metadata checkpoints while the job is still running. */
  persistMeta?: boolean;
}

@Injectable()
export class JobRunnerService implements OnModuleInit {
  private readonly logger = new Logger(JobRunnerService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * A process can disappear after a job has recorded `running` but before its
   * completion update. Make that state explicit before schedulers start again.
   */
  async onModuleInit(): Promise<void> {
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE "JobRun"
       SET "status" = 'interrupted', "finishedAt" = ?, "errorMessage" = ?
       WHERE "status" = 'running'`,
      toSqliteDateTime(),
      '进程异常退出，任务被中断；仅幂等任务允许重试'
    );
    if (Number(result) > 0) {
      this.logger.warn(`已将 ${Number(result)} 条遗留 running 任务标记为 interrupted`);
    }
  }

  /**
   * Wraps job execution with standardized JobRun auditing, timing, and error handling.
   */
  async runJob(
    jobName: string,
    jobFn: (setMeta: (meta: Record<string, unknown>) => void) => Promise<number | void>,
    initialMeta?: Record<string, unknown>,
    options?: JobRunnerRunOptions
  ): Promise<void> {
    const id = newEntityId('job');
    const startTime = Date.now();
    const startedAt = toSqliteDateTime();
    let meta: Record<string, unknown> | null = initialMeta ? { ...initialMeta } : null;
    let metaVersion = initialMeta ? 1 : 0;
    let persistedMetaVersion = metaVersion;
    let checkpointWriteScheduled = false;
    let checkpointWriteError: unknown;
    let checkpointWriteTail: Promise<void> = Promise.resolve();

    const scheduleMetaCheckpoint = () => {
      if (!options?.persistMeta || checkpointWriteScheduled || checkpointWriteError) return;
      checkpointWriteScheduled = true;
      checkpointWriteTail = checkpointWriteTail
        .then(async () => {
          while (!checkpointWriteError && persistedMetaVersion < metaVersion) {
            const versionToPersist = metaVersion;
            const snapshot = meta ? JSON.stringify(meta) : null;
            try {
              await this.prisma.$executeRawUnsafe(
                `UPDATE "JobRun"
                 SET "metaJson" = ?
                 WHERE "id" = ? AND "status" = 'running'`,
                snapshot,
                id
              );
              persistedMetaVersion = versionToPersist;
            } catch (err: unknown) {
              checkpointWriteError = err;
            }
          }
        })
        .finally(() => {
          checkpointWriteScheduled = false;
        });
    };

    const setMeta = (data: Record<string, unknown>) => {
      meta = { ...(meta ?? {}), ...data };
      metaVersion += 1;
      scheduleMetaCheckpoint();
    };

    // 1. Record running status
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "JobRun" ("id", "jobName", "status", "startedAt", "createdAt", "metaJson")
         VALUES (?, ?, 'running', ?, datetime('now'), ?)`,
        id,
        jobName,
        startedAt,
        meta ? JSON.stringify(meta) : null
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to insert initial JobRun for ${jobName}; job will not execute: ${errorMsg}`
      );
      // Running without an audit row makes recovery and operator diagnosis
      // impossible. Fail closed so the scheduler can surface the persistence
      // failure and retry on its next invocation.
      throw err;
    }

    // 2. Execute job payload
    try {
      const processedCount = await jobFn(setMeta);
      await checkpointWriteTail;
      if (checkpointWriteError) throw checkpointWriteError;
      const itemsProcessed = typeof processedCount === 'number' ? processedCount : 0;
      const durationMs = Date.now() - startTime;
      const finishedAt = toSqliteDateTime();

      await this.prisma.$executeRawUnsafe(
        `UPDATE "JobRun"
         SET "status" = 'success', "finishedAt" = ?, "durationMs" = ?, "itemsProcessed" = ?, "metaJson" = ?
         WHERE "id" = ?`,
        finishedAt,
        durationMs,
        itemsProcessed,
        meta ? JSON.stringify(meta) : null,
        id
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;
      const finishedAt = toSqliteDateTime();
      this.logger.error(`Job [${jobName}] failed after ${durationMs}ms: ${errorMsg}`);

      try {
        await checkpointWriteTail;
        const checkpointErrorMsg =
          checkpointWriteError instanceof Error ? checkpointWriteError.message : undefined;
        const persistedErrorMsg = checkpointErrorMsg
          ? `${errorMsg}; metadata checkpoint failed: ${checkpointErrorMsg}`
          : errorMsg;
        await this.prisma.$executeRawUnsafe(
          `UPDATE "JobRun"
         SET "status" = 'failed', "finishedAt" = ?, "durationMs" = ?, "errorMessage" = ?, "metaJson" = ?
         WHERE "id" = ?`,
          finishedAt,
          durationMs,
          persistedErrorMsg,
          meta ? JSON.stringify(meta) : null,
          id
        );
      } catch (statusErr: unknown) {
        const statusErrorMsg = statusErr instanceof Error ? statusErr.message : String(statusErr);
        this.logger.error(
          `Failed to persist failed JobRun for ${jobName}; original error: ${errorMsg}; persistence error: ${statusErrorMsg}`
        );
        throw statusErr;
      }
    }
  }

  /**
   * Paginated list of JobRun records.
   */
  async listRuns(query: { jobName?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.jobName) {
      conditions.push(`"jobName" = ?`);
      params.push(query.jobName);
    }
    if (query.status) {
      conditions.push(`"status" = ?`);
      params.push(query.status);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRows = await this.prisma.$queryRawUnsafe<[{ count: number }]>(
      `SELECT COUNT(*) as count FROM "JobRun" ${where}`,
      ...params
    );
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await this.prisma.$queryRawUnsafe<JobRunRecord[]>(
      `SELECT "id", "jobName", "status", "startedAt", "finishedAt", "durationMs",
              "itemsProcessed", "errorMessage", "metaJson", "createdAt"
       FROM "JobRun" ${where} ORDER BY "startedAt" DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset
    );

    return {
      items: rows,
      total,
      page,
      pageSize
    };
  }

  /** Find the latest run whose JSON metadata contains an exact scalar value. */
  async findLatestByMeta(
    jobName: string,
    metaKey: string,
    metaValue: string
  ): Promise<JobRunRecord | null> {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(metaKey)) {
      throw new Error(`Invalid JobRun metadata key: ${metaKey}`);
    }
    const rows = await this.prisma.$queryRawUnsafe<JobRunRecord[]>(
      `SELECT "id", "jobName", "status", "startedAt", "finishedAt", "durationMs",
              "itemsProcessed", "errorMessage", "metaJson", "createdAt"
       FROM "JobRun"
       WHERE "jobName" = ?
         AND json_valid("metaJson") = 1
         AND json_extract("metaJson", ?) = ?
       ORDER BY "startedAt" DESC, "id" DESC
       LIMIT 1`,
      jobName,
      `$.${metaKey}`,
      metaValue
    );
    return rows[0] ?? null;
  }

  /**
   * Latest execution status grouped by jobName.
   */
  async getJobStatuses() {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        jobName: string;
        lastStatus: string;
        lastRunAt: string;
        lastDurationMs: number | null;
        lastErrorMessage: string | null;
      }>
    >(
      `SELECT jr."jobName",
              jr."status" AS "lastStatus",
              jr."startedAt" AS "lastRunAt",
              jr."durationMs" AS "lastDurationMs",
              jr."errorMessage" AS "lastErrorMessage"
       FROM "JobRun" jr
       WHERE NOT EXISTS (
         SELECT 1
         FROM "JobRun" newer
         WHERE newer."jobName" = jr."jobName"
           AND (
             newer."startedAt" > jr."startedAt"
             OR (newer."startedAt" = jr."startedAt" AND newer."id" > jr."id")
           )
       )
       ORDER BY jr."jobName"`
    );
    return rows;
  }
}
