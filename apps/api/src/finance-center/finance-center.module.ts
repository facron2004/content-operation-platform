import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { FinanceCenterController } from './finance-center.controller';
import { FinanceCenterService } from './finance-center.service';
import { FinanceAssetService } from './finance-asset.service';
import { FinanceOperationsService } from './finance-operations.service';

@Module({
  imports: [IdempotencyModule],
  controllers: [FinanceCenterController],
  providers: [FinanceCenterService, FinanceAssetService, FinanceOperationsService],
  exports: [FinanceCenterService, FinanceAssetService, FinanceOperationsService]
})
export class FinanceCenterModule {}
