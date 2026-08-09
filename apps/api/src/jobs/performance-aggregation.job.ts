import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { beijingDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { bulkRefreshTaskPerformanceDaily } from '../common/task-performance-daily';
import { PERF_JOB_TASK_LIMIT } from '../common/sql-chunk';
import { JobRunnerService } from './job-runner.service';

type TaskRow = { taskId: string; trackingCode: string | null };

@Injectable()
export class PerformanceAggregationJob {
  private readonly logger = new Logger(PerformanceAggregationJob.name);
  // Overlap guard: a slow hour must not stack a second full task scan.
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /**
   * Run every hour.
   * Bulk-aggregate visits + OA money for published/completed tasks (most recently
   * updated first, hard-capped), then multi-row upsert into TaskPerformanceDaily
   * (residual #87 — was N serial INSERT…ON CONFLICT after 2 bulk scans).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async aggregatePerformance() {
    if (this.running) {
      this.logger.warn('Skipping performance aggregation — previous run still in flight');
      return;
    }
    this.running = true;
    await this.jobRunner
      .runJob('performance-aggregation', async (setMeta) => {
        this.logger.log('Aggregating task performance...');
        // Business day is Beijing (UTC+8); UTC dateKey would mis-bucket 00:00–08:00 CST.
        const today = beijingDateKey(new Date());
        const tasks = await this.prisma.$queryRawUnsafe<TaskRow[]>(
          `SELECT "taskId", "trackingCode" FROM "DistributionTask"
           WHERE "status" IN ('published', 'completed')
           ORDER BY "updatedAt" DESC
           LIMIT ?`,
          PERF_JOB_TASK_LIMIT
        );

        if (!tasks.length) {
          setMeta({ taskCount: 0, updatedCount: 0, date: today });
          this.logger.log('No published/completed tasks to aggregate');
          return 0;
        }

        const updated = await bulkRefreshTaskPerformanceDaily(this.prisma, tasks, today);
        setMeta({ taskCount: tasks.length, updatedCount: updated, date: today });
        this.logger.log(`Upserted performance for ${updated}/${tasks.length} tasks`);
        return updated;
      })
      .finally(() => {
        this.running = false;
      });
  }
}
