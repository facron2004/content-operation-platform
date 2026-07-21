/** Consolidated zero-sales module. */
import { Module } from '@nestjs/common';
import { ZeroSalesController } from './zero-sales.controller';
import { ZeroSalesService } from './zero-sales.service';

// --- zero-sales.module.ts ---
@Module({
  controllers: [ZeroSalesController],
  providers: [ZeroSalesService],
  exports: [ZeroSalesService]
})
export class ZeroSalesModule {}
