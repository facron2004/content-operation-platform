import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  DAILY_METRICS_PURGE_BATCH,
  DAILY_METRICS_PURGE_MAX_BATCHES,
  DAILY_METRICS_RETENTION_DAYS
} from '../common/sql-chunk';
import { JobRunnerService } from './job-runner.service';

/**
 * Bounded PackageSalesDaily + MerchantDailyMetrics + platform DailyMetrics retention.
 *
 * GMV refresh upserts package/merchant daily forever; platform DailyMetrics is
 * one row per day. Free-form range readers clamp to 90d, but the merchant-sales
 * `year` window spans a full calendar year and is compared year-over-year, so
 * retention is set to 800d (see DAILY_METRICS_RETENTION_DAYS) — anything older
 * only grows SQLite and is swept here.
 */
@Injectable()
export class DailyMetricsRetentionJob {
  private readonly logger = new Logger(DailyMetricsRetentionJob.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /** Daily retention sweep — staggered after TPD purge (8am). */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async purgeExpiredMetrics() {
    if (this.running) {
      this.logger.warn('Skipping daily-metrics retention — previous run still in flight');
      return;
    }
    this.running = true;
    await this.jobRunner
      .runJob('daily-metrics-retention', async (setMeta) => {
        const result = await this.purgeOlderThan(DAILY_METRICS_RETENTION_DAYS);
        setMeta({ ...result, retentionDays: DAILY_METRICS_RETENTION_DAYS });
        if (result.packageSales + result.merchantDaily + result.platformDaily > 0) {
          this.logger.log(
            `Purged daily metrics older than ${DAILY_METRICS_RETENTION_DAYS}d ` +
              `(PackageSalesDaily=${result.packageSales}, MerchantDailyMetrics=${result.merchantDaily}, DailyMetrics=${result.platformDaily})`
          );
        }
        return result.packageSales + result.merchantDaily + result.platformDaily;
      })
      .finally(() => {
        this.running = false;
      });
  }

  /**
   * Delete PackageSalesDaily + MerchantDailyMetrics + DailyMetrics with date
   * strictly before today - retentionDays. Batched per large table; returns counts.
   * Exported for tests.
   */
  async purgeOlderThan(
    retentionDays: number,
    options: { batchSize?: number; maxBatches?: number; today?: string } = {}
  ): Promise<{ packageSales: number; merchantDaily: number; platformDaily: number }> {
    const days = Math.max(1, Math.floor(retentionDays));
    const batchSize = Math.max(1, options.batchSize ?? DAILY_METRICS_PURGE_BATCH);
    const maxBatches = Math.max(1, options.maxBatches ?? DAILY_METRICS_PURGE_MAX_BATCHES);
    const today = options.today ?? beijingDateKey(new Date());
    const cutoff = shiftDateKey(today, -days);

    const packageSales = await this.purgePackageSalesDaily(cutoff, batchSize, maxBatches);
    const merchantDaily = await this.purgeMerchantDailyMetrics(cutoff, batchSize, maxBatches);
    // Platform DailyMetrics is 1 row/day — single DELETE is enough (no batch loop).
    const platformDaily = await this.purgePlatformDailyMetrics(cutoff);
    return { packageSales, merchantDaily, platformDaily };
  }

  private async purgePlatformDailyMetrics(cutoff: string): Promise<number> {
    const removed = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "DailyMetrics" WHERE "date" < ?`,
      cutoff
    );
    return Number(removed) || 0;
  }

  private async purgePackageSalesDaily(
    cutoff: string,
    batchSize: number,
    maxBatches: number
  ): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "PackageSalesDaily"
         WHERE "id" IN (
           SELECT "id" FROM "PackageSalesDaily"
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

  private async purgeMerchantDailyMetrics(
    cutoff: string,
    batchSize: number,
    maxBatches: number
  ): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      // Composite PK (merchantName, date) — subquery projects both key cols.
      const removed = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "MerchantDailyMetrics"
         WHERE ("merchantName", "date") IN (
           SELECT "merchantName", "date" FROM "MerchantDailyMetrics"
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
