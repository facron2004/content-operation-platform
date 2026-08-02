import { Module } from '@nestjs/common';
import { DistributionTaskController } from './distribution-task.controller';
import { DistributionTaskService } from './distribution-task.service';
import { DistributionExecutionService } from './distribution-execution.service';
import { CreateTaskService } from './application/create-task.service';
import { PublishTaskService } from './application/publish-task.service';
import { CancelTaskService } from './application/cancel-task.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [IdempotencyModule],
  controllers: [DistributionTaskController],
  providers: [
    DistributionTaskService,
    DistributionExecutionService,
    CreateTaskService,
    PublishTaskService,
    CancelTaskService
  ],
  exports: [DistributionTaskService, DistributionExecutionService]
})
export class DistributionTaskModule {}
