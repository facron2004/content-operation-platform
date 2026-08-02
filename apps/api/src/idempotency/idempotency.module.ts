import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyGuard } from './idempotency.guard';

@Module({
  providers: [IdempotencyService, IdempotencyGuard],
  exports: [IdempotencyService, IdempotencyGuard]
})
export class IdempotencyModule {}
