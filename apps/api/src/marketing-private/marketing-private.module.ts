import { Module } from '@nestjs/common';
import { FinanceCenterModule } from '../finance-center/finance-center.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { MarketingPrivateController } from './marketing-private.controller';
import { MarketingPrivateService } from './marketing-private.service';

@Module({
  imports: [FinanceCenterModule, IdempotencyModule],
  controllers: [MarketingPrivateController],
  providers: [MarketingPrivateService],
  exports: [MarketingPrivateService]
})
export class MarketingPrivateModule {}
