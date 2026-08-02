import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxProcessorJob } from './outbox-processor.job';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  providers: [OutboxService, OutboxProcessorJob],
  exports: [OutboxService]
})
export class OutboxModule {}
