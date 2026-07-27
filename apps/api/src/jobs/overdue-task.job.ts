import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';

@Injectable()
export class OverdueTaskJob {
  private readonly logger = new Logger(OverdueTaskJob.name);
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Run every 30 minutes.
   * Find scheduled tasks whose plannedAt is more than 30 minutes past and mark as 'overdue'.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async markOverdueTasks() {
    if (this.running) {
      this.logger.warn('Skipping overdue check — previous run still in flight');
      return;
    }
    this.running = true;
    this.logger.log('Checking for overdue tasks...');
    // Normalize timestamps so mixed ISO/space storage cannot break lexicographic <=.
    const thirtyMinutesAgo = toSqliteDateTime(Date.now() - 30 * 60 * 1000);
    const now = toSqliteDateTime();

    try {
      const result = await this.prisma.$executeRawUnsafe(
        `UPDATE "DistributionTask"
         SET "status" = 'overdue', "updatedAt" = ?
         WHERE "status" = 'scheduled'
           AND "plannedAt" IS NOT NULL
           AND ${sqlDatetime('"plannedAt"')} <= datetime(?)`,
        now,
        thirtyMinutesAgo
      );

      if (result > 0) {
        this.logger.log(`Marked ${result} tasks as overdue`);
      }
    } catch (err) {
      this.logger.warn(`Failed to mark overdue tasks: ${err}`);
    } finally {
      this.running = false;
    }
  }
}
