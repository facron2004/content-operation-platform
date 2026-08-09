/** Consolidated GMV module. */
import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { JobsModule } from '../jobs/jobs.module';
import { MerchantSalesModule } from '../merchant-sales/merchant-sales.module';
import { OverviewModule } from '../overview/overview.module';
import { RefundModule } from '../refund/refund.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { GmvController } from './gmv.controller';
import { GmvService } from './gmv.service';

// --- gmv.module.ts ---
@Module({
  imports: [
    ContentModule,
    JobsModule,
    MerchantSalesModule,
    OverviewModule,
    RefundModule,
    IdempotencyModule
  ],
  controllers: [GmvController],
  providers: [GmvService],
  exports: [GmvService]
})
export class GmvModule {}
