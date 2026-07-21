/** Consolidated GMV module. */
import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { MerchantSalesModule } from '../merchant-sales/merchant-sales.module';
import { OverviewModule } from '../overview/overview.module';
import { RefundModule } from '../refund/refund.module';
import { GmvController } from './gmv.controller';
import { GmvService } from './gmv.service';

// --- gmv.module.ts ---
@Module({
  imports: [ContentModule, MerchantSalesModule, OverviewModule, RefundModule],
  controllers: [GmvController],
  providers: [GmvService],
  exports: [GmvService]
})
export class GmvModule {}
