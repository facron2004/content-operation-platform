import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { JobRunnerModule } from '../jobs/job-runner.module';
import { FinanceCenterController } from './finance-center.controller';
import { FinanceCenterService } from './finance-center.service';
import { FinanceAssetService } from './finance-asset.service';
import { FinanceOperationsService } from './finance-operations.service';
import { JeeSitePartnerAccountClient } from './jeesite-partner-account.client';
import { PartnerPickupPointService } from './partner-pickup-point.service';

@Module({
  imports: [ContentModule, JobRunnerModule, IdempotencyModule],
  controllers: [FinanceCenterController],
  providers: [
    FinanceCenterService,
    FinanceAssetService,
    FinanceOperationsService,
    JeeSitePartnerAccountClient,
    PartnerPickupPointService
  ],
  exports: [
    FinanceCenterService,
    FinanceAssetService,
    FinanceOperationsService,
    PartnerPickupPointService
  ]
})
export class FinanceCenterModule {}
