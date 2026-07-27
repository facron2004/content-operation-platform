import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  TASK_PERFORMANCE_DAILY_PURGE_BATCH,
  TASK_PERFORMANCE_DAILY_PURGE_MAX_BATCHES,
  TASK_PERFORMANCE_DAILY_RETENTION_DAYS
} from '../common/sql-chunk';

/**
 * Bounded TaskPerformanceDaily retention.
 *
 * Hourly aggregation upserts one row per published/completed task per day.
 * Campaign KPI readers clamp to 90d; older rows only grow SQLite. Unique
 * (taskId, date) bounds duplicates but not history length.
 */
@Injectable()
export class TaskPerformanceDailyRetentionJob {
  private readonly logger = new Logger(TaskPerformanceDailyRetentionJob.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Daily retention sweep — staggered after DistributionExecution purge (7am). */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async purgeExpiredMetrics() {
    if (this.running) {
      this.logger.warn('Skipping TaskPerformanceDaily retention — previous run still in flight');
      return;
    }
    this.running = true;
    try {
      const deleted = await this.purgeOlderThan(TASK_PERFORMANCE_DAILY_RETENTION_DAYS);
      if (deleted > 0) {
        this.logger.log(
          `Purged ${deleted} TaskPerformanceDaily rows older than ${TASK_PERFORMANCE_DAILY_RETENTION_DAYS}d`
        );
      }
    } catch (err) {
      this.logger.warn(`TaskPerformanceDaily retention failed: ${err}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Delete TPD rows with date strictly before today - retentionDays.
   * `date` is a YYYY-MM-DD business key (Beijing) — lexicographic compare is safe.
   * Batched; returns total rows removed. Exported for unit tests.
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; today?: string } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? TASK_PERFORMANCE_DAILY_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? TASK_PERFORMANCE_DAILY_PURGE_MAX_BATCHES);
    const today = options.today ?? beijingDateKey(new Date());
    // Exclusive: keep the last `days` calendar days including today → cutoff is today-(days).
    const cutoff = shiftDateKey(today, -days);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      // Unique is (taskId, date); project both for deterministic delete.
      // Prefer id when present (cuid PK) for simpler subquery — both work.
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "TaskPerformanceDaily"
         WHERE "id" IN (
           SELECT "id" FROM "TaskPerformanceDaily"
           WHERE "date" < ?
           ORDER BY "date" ASC
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
