import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  GENERATED_COPY_PURGE_BATCH,
  GENERATED_COPY_PURGE_MAX_BATCHES,
  GENERATED_COPY_RETENTION_DAYS
} from '../common/sql-chunk';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';

/**
 * Bounded GeneratedCopy retention for non-approved history.
 *
 * AI / manual generation appends full body/title/CTA rows. Interactive list is
 * already capped at 90d, but draft/rejected/pending rows older than retention
 * only grow SQLite. Keep approved + isReusable copies for re-use and task
 * contentId linkage (DistributionTask has no FK CASCADE on contentId).
 * CopyPerformance cascades via GeneratedCopy contentId FK.
 */
@Injectable()
export class GeneratedCopyRetentionJob {
  private readonly logger = new Logger(GeneratedCopyRetentionJob.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Daily retention sweep — staggered after inventory purge (5am). */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async purgeExpiredCopies() {
    if (this.running) {
      this.logger.warn('Skipping GeneratedCopy retention — previous run still in flight');
      return;
    }
    this.running = true;
    try {
      const deleted = await this.purgeOlderThan(GENERATED_COPY_RETENTION_DAYS);
      if (deleted > 0) {
        this.logger.log(
          `Purged ${deleted} non-approved GeneratedCopy rows older than ${GENERATED_COPY_RETENTION_DAYS}d`
        );
      }
    } catch (err) {
      this.logger.warn(`GeneratedCopy retention failed: ${err}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Delete non-approved GeneratedCopy with createdAt strictly before now - retentionDays.
   * Never deletes auditStatus='approved' or isReusable=1 rows.
   * Batched; returns total rows removed. Exported for unit tests.
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; nowMs?: number } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? GENERATED_COPY_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? GENERATED_COPY_PURGE_MAX_BATCHES);
    const cutoff = toSqliteDateTime((options.nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "GeneratedCopy"
         WHERE "contentId" IN (
           SELECT "contentId" FROM "GeneratedCopy"
           WHERE ${sqlDatetime('"createdAt"')} < datetime(?)
             AND "auditStatus" != 'approved'
             AND COALESCE("isReusable", 0) = 0
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
