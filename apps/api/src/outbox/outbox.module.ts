import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxProcessorJob } from './outbox-processor.job';
import { JobsModule } from '../jobs/jobs.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TaskPublishedOutboxHandler } from './task-published.handler';

@Module({
  imports: [JobsModule, AuditLogModule],
  providers: [OutboxService, OutboxProcessorJob, TaskPublishedOutboxHandler],
  exports: [OutboxService]
})
export class OutboxModule {}
