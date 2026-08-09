import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  TRACKING_VISIT_PURGE_BATCH,
  TRACKING_VISIT_PURGE_MAX_BATCHES,
  TRACKING_VISIT_RETENTION_DAYS
} from '../common/sql-chunk';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';
import { JobRunnerService } from './job-runner.service';

/**
 * Bounded TrackingVisit retention.
 *
 * Public tracking is lifecycle-gated but still append-only while a code is live.
 * Without purge, SQLite + attribution/performance scans grow forever (visitTime
 * predicates used to table-scan the single-column trackingCode index history).
 *
 * Safe to drop rows older than retention because:
 * - channel attribution windows are ≤ 72h
 * - TaskPerformanceDaily already stores daily visitCount aggregates
 */
@Injectable()
export class TrackingVisitRetentionJob {
  private readonly logger = new Logger(TrackingVisitRetentionJob.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /** Daily retention sweep — off-peak relative to hourly performance job. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredVisits() {
    if (this.running) {
      this.logger.warn('Skipping visit retention — previous run still in flight');
      return;
    }
    this.running = true;
    await this.jobRunner
      .runJob('tracking-visit-retention', async (setMeta) => {
        const deleted = await this.purgeOlderThan(TRACKING_VISIT_RETENTION_DAYS);
        setMeta({ deleted, retentionDays: TRACKING_VISIT_RETENTION_DAYS });
        if (deleted > 0) {
          this.logger.log(
            `Purged ${deleted} TrackingVisit rows older than ${TRACKING_VISIT_RETENTION_DAYS}d`
          );
        }
        return deleted;
      })
      .finally(() => {
        this.running = false;
      });
  }

  /**
   * Delete visits with visitTime strictly before now - retentionDays.
   * Batched to bound write-lock duration; returns total rows removed.
   * Exported for unit tests (mock prisma).
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; nowMs?: number } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? TRACKING_VISIT_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? TRACKING_VISIT_PURGE_MAX_BATCHES);
    const cutoff = toSqliteDateTime((options.nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      // Subquery + IN keeps deletes index-friendly under mixed ISO/space visitTime.
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "TrackingVisit"
         WHERE "visitId" IN (
           SELECT "visitId" FROM "TrackingVisit"
           WHERE ${sqlDatetime('"visitTime"')} < datetime(?)
           ORDER BY ${sqlDatetime('"visitTime"')} ASC
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
