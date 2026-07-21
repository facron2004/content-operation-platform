import { Module } from '@nestjs/common';
import { DistributionTaskController } from './distribution-task.controller';
import { DistributionTaskService } from './distribution-task.service';
import { DistributionExecutionService } from './distribution-execution.service';

@Module({
  controllers: [DistributionTaskController],
  providers: [DistributionTaskService, DistributionExecutionService],
  exports: [DistributionTaskService, DistributionExecutionService]
})
export class DistributionTaskModule {}
