import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALERT_RESOLUTION_PURGE_BATCH,
  ALERT_RESOLUTION_PURGE_MAX_BATCHES,
  ALERT_RESOLUTION_RETENTION_DAYS
} from '../common/sql-chunk';

/**
 * Bounded OperationAlertResolution retention.
 *
 * Resolve writes one row per (alertId, resolvedDate). Interactive readers only
 * load today's set (RESOLVED_ALERT_DAY_LIMIT). Older days only grow SQLite;
 * resolvedDate index already exists for age-ordered purge.
 */
@Injectable()
export class AlertResolutionRetentionJob {
  private readonly logger = new Logger(AlertResolutionRetentionJob.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Daily retention sweep — staggered after daily-metrics purge (9am). */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async purgeExpiredResolutions() {
    if (this.running) {
      this.logger.warn('Skipping alert-resolution retention — previous run still in flight');
      return;
    }
    this.running = true;
    try {
      const deleted = await this.purgeOlderThan(ALERT_RESOLUTION_RETENTION_DAYS);
      if (deleted > 0) {
        this.logger.log(
          `Purged ${deleted} OperationAlertResolution rows older than ${ALERT_RESOLUTION_RETENTION_DAYS}d`
        );
      }
    } catch (err) {
      this.logger.warn(`OperationAlertResolution retention failed: ${err}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Delete resolutions with resolvedDate strictly before today - retentionDays.
   * resolvedDate is YYYY-MM-DD — lexicographic compare is safe.
   * Batched; returns total rows removed. Exported for unit tests.
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; today?: string } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? ALERT_RESOLUTION_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? ALERT_RESOLUTION_PURGE_MAX_BATCHES);
    const today = options.today ?? beijingDateKey(new Date());
    const cutoff = shiftDateKey(today, -days);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      // Composite PK (alertId, resolvedDate).
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "OperationAlertResolution"
         WHERE ("alertId", "resolvedDate") IN (
           SELECT "alertId", "resolvedDate" FROM "OperationAlertResolution"
           WHERE "resolvedDate" < ?
           ORDER BY "resolvedDate" ASC
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
