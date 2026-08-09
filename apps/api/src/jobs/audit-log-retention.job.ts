import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIT_LOG_PURGE_BATCH,
  AUDIT_LOG_PURGE_MAX_BATCHES,
  AUDIT_LOG_RETENTION_DAYS
} from '../common/sql-chunk';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';
import { JobRunnerService } from './job-runner.service';

/**
 * Bounded OperationAuditLog retention.
 *
 * AuditLogInterceptor appends on every mutation. Without purge the table grows
 * unbounded (before/after JSON payloads) and interactive list COUNT/ORDER BY
 * degrades even with the 90d query window.
 */
@Injectable()
export class AuditLogRetentionJob {
  private readonly logger = new Logger(AuditLogRetentionJob.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /** Daily retention sweep — staggered after visit purge (3am). */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpiredLogs() {
    if (this.running) {
      this.logger.warn('Skipping audit retention — previous run still in flight');
      return;
    }
    this.running = true;
    await this.jobRunner
      .runJob('audit-log-retention', async (setMeta) => {
        const deleted = await this.purgeOlderThan(AUDIT_LOG_RETENTION_DAYS);
        setMeta({ deleted, retentionDays: AUDIT_LOG_RETENTION_DAYS });
        if (deleted > 0) {
          this.logger.log(
            `Purged ${deleted} OperationAuditLog rows older than ${AUDIT_LOG_RETENTION_DAYS}d`
          );
        }
        return deleted;
      })
      .finally(() => {
        this.running = false;
      });
  }

  /**
   * Delete audit rows with createdAt strictly before now - retentionDays.
   * Batched to bound write-lock duration; returns total rows removed.
   * Exported for unit tests (mock prisma).
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; nowMs?: number } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? AUDIT_LOG_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? AUDIT_LOG_PURGE_MAX_BATCHES);
    const cutoff = toSqliteDateTime((options.nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "OperationAuditLog"
         WHERE "logId" IN (
           SELECT "logId" FROM "OperationAuditLog"
           WHERE ${sqlDatetime('"createdAt"')} < datetime(?)
           ORDER BY ${sqlDatetime('"createdAt"')} ASC
           LIMIT ?
         )`,
        cutoff,
        batchSize
      );
      const n = Number(removed) || 0;
      total += n;
      if (n < batchSize) break;
    }
    return total;
  }
}
