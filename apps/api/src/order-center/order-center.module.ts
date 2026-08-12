import { Module } from '@nestjs/common';
import { OrderCenterController } from './order-center.controller';
import { OrderCenterService } from './order-center.service';
import { OrderTransactionService } from './order-transaction.service';
import { OutboxModule } from '../outbox/outbox.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OrderTransactionOutboxHandler } from './order-transaction-outbox.handler';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [OutboxModule, IdempotencyModule, InventoryModule],
  controllers: [OrderCenterController],
  providers: [OrderCenterService, OrderTransactionService, OrderTransactionOutboxHandler],
  exports: [OrderCenterService, OrderTransactionService, InventoryModule]
})
export class OrderCenterModule {}
