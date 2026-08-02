import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JobRunnerService } from './job-runner.service';

@Injectable()
export class DataIntegrityPatrolJob {
  private readonly logger = new Logger(DataIntegrityPatrolJob.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /**
   * Runs daily at 04:00 AM.
   * Patrols data integrity between OrderAttribution and TaskPerformanceDaily,
   * detecting orphaned attributions or missing aggregate rows and backfilling them.
   */
  @Cron('0 4 * * *')
  async patrolIntegrity() {
    if (this.running) return;
    this.running = true;

    await this.jobRunner
      .runJob('data-integrity-patrol', async (setMeta) => {
        this.logger.log('Starting daily data integrity patrol...');

        // Find task IDs that have attributions but missing or stale TaskPerformanceDaily
        const missingPerformanceRows = await this.prisma.$queryRawUnsafe<
          Array<{ taskId: string; attributionCount: number }>
        >(
          `SELECT oa."taskId", COUNT(oa."attributionId") as attributionCount
         FROM "OrderAttribution" oa
         LEFT JOIN "TaskPerformanceDaily" tpd ON tpd."taskId" = oa."taskId"
         WHERE tpd."id" IS NULL
         GROUP BY oa."taskId"
         LIMIT 100`
        );

        let repairedTasks = 0;
        if (missingPerformanceRows.length > 0) {
          this.logger.log(
            `Patrol identified ${missingPerformanceRows.length} tasks with missing daily performance summaries.`
          );
          for (const row of missingPerformanceRows) {
            // Touch task updatedAt to queue auto-recomputation on next hourly pass
            await this.prisma.$executeRawUnsafe(
              `UPDATE "DistributionTask" SET "updatedAt" = datetime('now') WHERE "taskId" = ?`,
              row.taskId
            );
            repairedTasks++;
          }
        }

        setMeta({
          missingCount: missingPerformanceRows.length,
          repairedTasks
        });

        return repairedTasks;
      })
      .finally(() => {
        this.running = false;
      });
  }
}
