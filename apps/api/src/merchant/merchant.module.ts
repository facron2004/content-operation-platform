import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [IdempotencyModule],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService]
})
export class MerchantModule {}
