import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { JobRunnerService } from './job-runner.service';

@Injectable()
export class IdempotencyRetentionJob {
  private readonly logger = new Logger(IdempotencyRetentionJob.name);
  private running = false;

  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async purgeExpiredRecords(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping idempotency retention — previous run still in flight');
      return;
    }
    this.running = true;
    await this.jobRunner
      .runJob('idempotency-retention', async (setMeta) => {
        const deleted = await this.idempotency.purgeExpired();
        setMeta({ deleted });
        if (deleted > 0) {
          this.logger.log(`Purged ${deleted} expired idempotency records`);
        }
        return deleted;
      })
      .finally(() => {
        this.running = false;
      });
  }
}
