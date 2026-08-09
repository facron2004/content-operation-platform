import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISTRIBUTION_EXECUTION_PURGE_BATCH,
  DISTRIBUTION_EXECUTION_PURGE_MAX_BATCHES,
  DISTRIBUTION_EXECUTION_RETENTION_DAYS
} from '../common/sql-chunk';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';
import { JobRunnerService } from './job-runner.service';

/**
 * Bounded DistributionExecution retention.
 *
 * Lifecycle transitions (publish/fail/complete/cancel/reschedule) append one
 * row per event, optionally with snapshotJson. Readers already LIMIT 500 per
 * task, but the table itself is append-only without purge.
 */
@Injectable()
export class DistributionExecutionRetentionJob {
  private readonly logger = new Logger(DistributionExecutionRetentionJob.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /** Daily retention sweep — staggered after GeneratedCopy purge (6am). */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async purgeExpiredExecutions() {
    if (this.running) {
      this.logger.warn('Skipping DistributionExecution retention — previous run still in flight');
      return;
    }
    this.running = true;
    await this.jobRunner
      .runJob('distribution-execution-retention', async (setMeta) => {
        const deleted = await this.purgeOlderThan(DISTRIBUTION_EXECUTION_RETENTION_DAYS);
        setMeta({ deleted, retentionDays: DISTRIBUTION_EXECUTION_RETENTION_DAYS });
        if (deleted > 0) {
          this.logger.log(
            `Purged ${deleted} DistributionExecution rows older than ${DISTRIBUTION_EXECUTION_RETENTION_DAYS}d`
          );
        }
        return deleted;
      })
      .finally(() => {
        this.running = false;
      });
  }

  /**
   * Delete execution rows with createdAt strictly before now - retentionDays.
   * Batched to bound write-lock duration; returns total rows removed.
   * Exported for unit tests (mock prisma).
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; nowMs?: number } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? DISTRIBUTION_EXECUTION_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? DISTRIBUTION_EXECUTION_PURGE_MAX_BATCHES);
    const cutoff = toSqliteDateTime((options.nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "DistributionExecution"
         WHERE "executionId" IN (
           SELECT "executionId" FROM "DistributionExecution"
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
