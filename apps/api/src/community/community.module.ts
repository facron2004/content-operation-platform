import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [IdempotencyModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService]
})
export class CommunityModule {}
