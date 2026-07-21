import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OverdueTaskJob {
  private readonly logger = new Logger(OverdueTaskJob.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Run every 30 minutes.
   * Find scheduled tasks whose plannedAt is more than 30 minutes past and mark as 'overdue'.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async markOverdueTasks() {
    this.logger.log('Checking for overdue tasks...');
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    try {
      const result = await this.prisma.$executeRawUnsafe(
        `UPDATE "DistributionTask"
         SET "status" = 'overdue', "updatedAt" = ?
         WHERE "status" = 'scheduled' AND "plannedAt" IS NOT NULL AND "plannedAt" <= ?`,
        now,
        thirtyMinutesAgo
      );

      if (result > 0) {
        this.logger.log(`Marked ${result} tasks as overdue`);
      }
    } catch (err) {
      this.logger.warn(`Failed to mark overdue tasks: ${err}`);
    }
  }
}
