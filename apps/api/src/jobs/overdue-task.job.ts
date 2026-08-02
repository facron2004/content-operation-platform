import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';
import { JobRunnerService } from './job-runner.service';

@Injectable()
export class OverdueTaskJob {
  private readonly logger = new Logger(OverdueTaskJob.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

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

    await this.jobRunner
      .runJob('overdue-task', async (setMeta) => {
        this.logger.log('Checking for overdue tasks...');
        const thirtyMinutesAgo = toSqliteDateTime(Date.now() - 30 * 60 * 1000);
        const now = toSqliteDateTime();

        const result = Number(
          (await this.prisma.$executeRawUnsafe(
            `UPDATE "DistributionTask"
           SET "status" = 'overdue', "updatedAt" = ?
           WHERE "status" = 'scheduled'
             AND "plannedAt" IS NOT NULL
             AND ${sqlDatetime('"plannedAt"')} <= datetime(?)`,
            now,
            thirtyMinutesAgo
          )) ?? 0
        );

        setMeta({ updatedCount: result });
        if (result > 0) {
          this.logger.log(`Marked ${result} tasks as overdue`);
        }
        return result;
      })
      .finally(() => {
        this.running = false;
      });
  }
}
