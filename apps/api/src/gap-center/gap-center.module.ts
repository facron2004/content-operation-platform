import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { CardService } from './card.service';
import { CrmService } from './crm.service';
import { DeliveryService } from './delivery.service';
import { GapCenterController } from './gap-center.controller';
import { MerchantScoreService } from './merchant-score.service';
import { PackageCombinationService } from './package-combination.service';
import { StoreService } from './store.service';

@Module({
  imports: [IdempotencyModule],
  controllers: [GapCenterController],
  providers: [
    PackageCombinationService,
    StoreService,
    MerchantScoreService,
    CrmService,
    DeliveryService,
    CardService
  ],
  exports: [PackageCombinationService, StoreService, MerchantScoreService, CrmService, DeliveryService, CardService]
})
export class GapCenterModule {}
