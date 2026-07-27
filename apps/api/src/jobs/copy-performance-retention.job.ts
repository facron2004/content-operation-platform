import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  COPY_PERFORMANCE_PURGE_BATCH,
  COPY_PERFORMANCE_PURGE_MAX_BATCHES,
  COPY_PERFORMANCE_RETENTION_DAYS
} from '../common/sql-chunk';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';

/**
 * Bounded CopyPerformance retention.
 *
 * Dashboard already clamps reads to 90d. GeneratedCopy retention only cascades
 * performance rows when the parent copy is deleted; approved copies keep
 * performance forever. Older rows only grow SQLite.
 */
@Injectable()
export class CopyPerformanceRetentionJob {
  private readonly logger = new Logger(CopyPerformanceRetentionJob.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Daily retention sweep — staggered after alert resolution (10am) → 11am. */
  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async purgeExpiredPerformance() {
    if (this.running) {
      this.logger.warn('Skipping CopyPerformance retention — previous run still in flight');
      return;
    }
    this.running = true;
    try {
      const deleted = await this.purgeOlderThan(COPY_PERFORMANCE_RETENTION_DAYS);
      if (deleted > 0) {
        this.logger.log(
          `Purged ${deleted} CopyPerformance rows older than ${COPY_PERFORMANCE_RETENTION_DAYS}d`
        );
      }
    } catch (err) {
      this.logger.warn(`CopyPerformance retention failed: ${err}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Delete CopyPerformance with createdAt strictly before now - retentionDays.
   * Batched; returns total rows removed. Exported for unit tests.
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; nowMs?: number } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? COPY_PERFORMANCE_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? COPY_PERFORMANCE_PURGE_MAX_BATCHES);
    const cutoff = toSqliteDateTime((options.nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      // CopyPerformance PK is `id` (cuid). Age-order by createdAt.
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "CopyPerformance"
         WHERE "id" IN (
           SELECT "id" FROM "CopyPerformance"
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
