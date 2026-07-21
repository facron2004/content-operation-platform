import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OverdueTaskJob } from './overdue-task.job';
import { PerformanceAggregationJob } from './performance-aggregation.job';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [OverdueTaskJob, PerformanceAggregationJob]
})
export class JobsModule {}
