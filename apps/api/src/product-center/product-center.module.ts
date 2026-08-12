import { Module } from '@nestjs/common';
import { ProductCenterController } from './product-center.controller';
import { ProductCenterService } from './product-center.service';
import { InventoryModule } from '../inventory/inventory.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [InventoryModule, IdempotencyModule],
  controllers: [ProductCenterController],
  providers: [ProductCenterService],
  exports: [ProductCenterService]
})
export class ProductCenterModule {}
