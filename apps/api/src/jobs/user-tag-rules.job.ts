import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketingPrivateService } from '../marketing-private/marketing-private.service';
import { JobRunnerService } from './job-runner.service';

@Injectable()
export class UserTagRulesJob {
  private readonly logger = new Logger(UserTagRulesJob.name);
  private running = false;

  constructor(
    @Inject(MarketingPrivateService) private readonly marketing: MarketingPrivateService,
    @Inject(JobRunnerService) private readonly jobRunner: JobRunnerService
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncRules() {
    if (this.running) return;
    this.running = true;
    await this.jobRunner
      .runJob('user-tag-rules', async (setMeta) => {
        const result = await this.marketing.syncActiveRuleTags();
        setMeta(result);
        if (result.evaluatedCount > 0) {
          this.logger.log(
            `Evaluated ${result.evaluatedCount} rule tags, matched ${result.matchedCount} memberships`
          );
        }
        return result.evaluatedCount;
      })
      .finally(() => {
        this.running = false;
      });
  }
}
