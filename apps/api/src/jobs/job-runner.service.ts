import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newEntityId } from '../common/id';
import { toSqliteDateTime } from '../common/sqlite-datetime';

export interface JobRunRecord {
  id: string;
  jobName: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  itemsProcessed: number;
  errorMessage: string | null;
  metaJson: string | null;
  createdAt: string;
}

@Injectable()
export class JobRunnerService {
  private readonly logger = new Logger(JobRunnerService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Wraps job execution with standardized JobRun auditing, timing, and error handling.
   */
  async runJob(
    jobName: string,
    jobFn: (setMeta: (meta: Record<string, unknown>) => void) => Promise<number | void>
  ): Promise<void> {
    const id = newEntityId('job');
    const startTime = Date.now();
    const startedAt = toSqliteDateTime();
    let meta: Record<string, unknown> | null = null;

    const setMeta = (data: Record<string, unknown>) => {
      meta = { ...(meta ?? {}), ...data };
    };

    // 1. Record running status
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "JobRun" ("id", "jobName", "status", "startedAt", "createdAt")
         VALUES (?, ?, 'running', ?, datetime('now'))`,
        id,
        jobName,
        startedAt
      );
    } catch (err: unknown) {
      this.logger.warn(`Failed to insert initial JobRun for ${jobName}: ${(err as Error).message}`);
    }

    // 2. Execute job payload
    try {
      const processedCount = await jobFn(setMeta);
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

      await this.prisma
        .$executeRawUnsafe(
          `UPDATE "JobRun"
         SET "status" = 'failed', "finishedAt" = ?, "durationMs" = ?, "errorMessage" = ?, "metaJson" = ?
         WHERE "id" = ?`,
          finishedAt,
          durationMs,
          errorMsg,
          meta ? JSON.stringify(meta) : null,
          id
        )
        .catch(() => {});
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
      `SELECT * FROM "JobRun" ${where} ORDER BY "startedAt" DESC LIMIT ? OFFSET ?`,
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
      `SELECT "jobName", "status" as "lastStatus", "startedAt" as "lastRunAt", "durationMs" as "lastDurationMs", "errorMessage" as "lastErrorMessage"
       FROM "JobRun"
       WHERE "id" IN (
         SELECT "id" FROM "JobRun" GROUP BY "jobName" HAVING MAX("startedAt")
       )
       ORDER BY "jobName"`
    );
    return rows;
  }
}
