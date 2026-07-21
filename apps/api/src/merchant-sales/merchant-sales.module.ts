/** Consolidated merchant-sales module. */
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantSalesController } from './merchant-sales.controller';
import { MERCHANT_SALES_SERVICE, MerchantSalesService } from './merchant-sales.service';

// --- merchant-sales.module.ts ---
@Module({
  imports: [PrismaModule],
  controllers: [MerchantSalesController],
  providers: [
    MerchantSalesService,
    { provide: MERCHANT_SALES_SERVICE, useExisting: MerchantSalesService }
  ],
  exports: [MerchantSalesService, MERCHANT_SALES_SERVICE]
})
export class MerchantSalesModule {}
