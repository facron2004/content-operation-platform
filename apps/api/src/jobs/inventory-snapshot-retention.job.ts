import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVENTORY_SNAPSHOT_PURGE_BATCH,
  INVENTORY_SNAPSHOT_PURGE_MAX_BATCHES,
  INVENTORY_SNAPSHOT_RETENTION_DAYS
} from '../common/sql-chunk';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { JobRunnerService } from './job-runner.service';

/**
 * Bounded JeeSiteInventoryDailySnapshot retention.
 *
 * Daily crawler upserts one row per package per day. Interactive timelines
 * (zero-sales / movement / recommend) cap at 90d, so older rows only grow
 * SQLite with no reader. Composite PK is (packageId, snapshotDate); purge by
 * snapshotDate using the existing single-column index.
 */
@Injectable()
export class InventorySnapshotRetentionJob {
  private readonly logger = new Logger(InventorySnapshotRetentionJob.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /** Daily retention sweep — staggered after audit purge (4am). */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async purgeExpiredSnapshots() {
    if (this.running) {
      this.logger.warn('Skipping inventory snapshot retention — previous run still in flight');
      return;
    }
    this.running = true;
    await this.jobRunner
      .runJob('inventory-snapshot-retention', async (setMeta) => {
        const deleted = await this.purgeOlderThan(INVENTORY_SNAPSHOT_RETENTION_DAYS);
        setMeta({ deleted, retentionDays: INVENTORY_SNAPSHOT_RETENTION_DAYS });
        if (deleted > 0) {
          this.logger.log(
            `Purged ${deleted} JeeSiteInventoryDailySnapshot rows older than ${INVENTORY_SNAPSHOT_RETENTION_DAYS}d`
          );
        }
        return deleted;
      })
      .finally(() => {
        this.running = false;
      });
  }

  /**
   * Delete inventory snapshots with snapshotDate strictly before today - retentionDays.
   * snapshotDate is a YYYY-MM-DD business key (Beijing) — lexicographic compare is safe.
   * Batched to bound write-lock duration; returns total rows removed.
   * Exported for unit tests (mock prisma).
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; today?: string } = {}
  ): Promise<number> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? INVENTORY_SNAPSHOT_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? INVENTORY_SNAPSHOT_PURGE_MAX_BATCHES);
    const today = options.today ?? beijingDateKey(new Date());
    // Exclusive: keep the last `days` calendar days including today → cutoff is today-(days).
    // Rows with snapshotDate < cutoff are older than retention.
    const cutoff = shiftDateKey(today, -days);

    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      // Composite PK (packageId, snapshotDate) — subquery projects both key cols.
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "JeeSiteInventoryDailySnapshot"
         WHERE ("packageId", "snapshotDate") IN (
           SELECT "packageId", "snapshotDate" FROM "JeeSiteInventoryDailySnapshot"
           WHERE "snapshotDate" < ?
           ORDER BY "snapshotDate" ASC
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
