import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertResolutionRetentionJob } from './alert-resolution-retention.job';
import { AuditLogRetentionJob } from './audit-log-retention.job';
import { CopyPerformanceRetentionJob } from './copy-performance-retention.job';
import { DailyMetricsRetentionJob } from './daily-metrics-retention.job';
import { DistributionExecutionRetentionJob } from './distribution-execution-retention.job';
import { GeneratedCopyRetentionJob } from './generated-copy-retention.job';
import { InventorySnapshotRetentionJob } from './inventory-snapshot-retention.job';
import { OverdueTaskJob } from './overdue-task.job';
import { PerformanceAggregationJob } from './performance-aggregation.job';
import { TaskPerformanceDailyRetentionJob } from './task-performance-daily-retention.job';
import { TrackingVisitRetentionJob } from './tracking-visit-retention.job';
import { JobRunnerService } from './job-runner.service';
import { JobMonitoringController } from './job-monitoring.controller';
import { DataIntegrityPatrolJob } from './data-integrity-patrol.job';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [JobMonitoringController],
  providers: [
    JobRunnerService,
    OverdueTaskJob,
    PerformanceAggregationJob,
    TrackingVisitRetentionJob,
    AuditLogRetentionJob,
    InventorySnapshotRetentionJob,
    GeneratedCopyRetentionJob,
    DistributionExecutionRetentionJob,
    TaskPerformanceDailyRetentionJob,
    DailyMetricsRetentionJob,
    AlertResolutionRetentionJob,
    CopyPerformanceRetentionJob,
    DataIntegrityPatrolJob
  ],
  exports: [JobRunnerService]
})
export class JobsModule {}
