import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [IdempotencyModule],
  controllers: [CampaignController],
  providers: [CampaignService],
  exports: [CampaignService]
})
export class CampaignModule {}
