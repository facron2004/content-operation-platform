import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { JobsModule } from '../jobs/jobs.module';
import { CardService } from './card.service';
import { CrmService } from './crm.service';
import { DeliveryService } from './delivery.service';
import { JeeSitePartnerShopClient } from './jeesite-partner-shop.client';
import { GapCenterController } from './gap-center.controller';
import { MerchantScoreService } from './merchant-score.service';
import { PackageCombinationService } from './package-combination.service';
import { StoreService } from './store.service';

@Module({
  imports: [ContentModule, JobsModule, IdempotencyModule],
  controllers: [GapCenterController],
  providers: [
    PackageCombinationService,
    JeeSitePartnerShopClient,
    StoreService,
    MerchantScoreService,
    CrmService,
    DeliveryService,
    CardService
  ],
  exports: [
    PackageCombinationService,
    StoreService,
    MerchantScoreService,
    CrmService,
    DeliveryService,
    CardService
  ]
})
export class GapCenterModule {}
