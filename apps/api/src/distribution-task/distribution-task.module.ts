import { Module } from '@nestjs/common';
import { DistributionTaskController } from './distribution-task.controller';
import { DistributionTaskCommandController } from './distribution-task-command.controller';
import { DistributionTaskService } from './distribution-task.service';
import { DistributionExecutionService } from './distribution-execution.service';
import { CreateTaskService } from './application/create-task.service';
import { PublishTaskService } from './application/publish-task.service';
import { CancelTaskService } from './application/cancel-task.service';
import { UpdateTaskService } from './application/update-task.service';
import { DeleteTaskService } from './application/delete-task.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [IdempotencyModule, OutboxModule],
  controllers: [DistributionTaskController, DistributionTaskCommandController],
  providers: [
    DistributionTaskService,
    DistributionExecutionService,
    CreateTaskService,
    PublishTaskService,
    CancelTaskService,
    UpdateTaskService,
    DeleteTaskService
  ],
  exports: [DistributionTaskService, DistributionExecutionService]
})
export class DistributionTaskModule {}
