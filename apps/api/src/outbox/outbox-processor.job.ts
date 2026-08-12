import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { JobRunnerService } from '../jobs/job-runner.service';

@Injectable()
export class OutboxProcessorJob {
  private readonly logger = new Logger(OutboxProcessorJob.name);
  private running = false;

  constructor(
    @Inject(OutboxService) private readonly outboxSvc: OutboxService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  /**
   * Process pending outbox events every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processOutboxEvents() {
    if (this.running) return;
    this.running = true;

    await this.jobRunner
      .runJob('outbox-processor', async (setMeta) => {
        const pending = await this.outboxSvc.fetchPending(50);
        if (!pending.length) {
          setMeta({ processedCount: 0 });
          return 0;
        }

        let successCount = 0;
        for (const event of pending) {
          try {
            this.logger.log(
              `Processing OutboxEvent [${event.id}]: ${event.aggregateType}.${event.eventType}`
            );
            await this.outboxSvc.dispatch(event);
            await this.outboxSvc.markProcessed(event.id);
            successCount++;
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to process OutboxEvent [${event.id}]: ${errMsg}`);
            await this.outboxSvc.markFailed(event.id, errMsg);
          }
        }

        setMeta({
          totalFetched: pending.length,
          successCount,
          failedCount: pending.length - successCount
        });
        return successCount;
      })
      .finally(() => {
        this.running = false;
      });
  }
}
