import { Module } from '@nestjs/common';
import { MerchantSalesController } from './merchant-sales.controller';
import { MerchantSalesService, MERCHANT_SALES_SERVICE } from './merchant-sales.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MerchantSalesController],
  providers: [
    MerchantSalesService,
    {
      provide: MERCHANT_SALES_SERVICE,
      useExisting: MerchantSalesService
    }
  ],
  exports: [MerchantSalesService, MERCHANT_SALES_SERVICE]
})
export class MerchantSalesModule {}
