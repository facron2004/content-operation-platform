import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ContentModule } from './content/content.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule, JwtAuthGuard } from './auth';
import { GlobalExceptionFilter } from './common';
import { GmvModule } from './gmv/gmv.module';
import { MerchantModule } from './merchant/merchant.module';
import { MerchantSalesModule } from './merchant-sales/merchant-sales.module';
import { MovementModule } from './movement/movement.module';
import { OverviewModule } from './overview/overview.module';
import { RefundModule } from './refund/refund.module';
import { ZeroSalesModule } from './zero-sales/zero-sales.module';

@Module({
  imports: [
    PrismaModule,
    ContentModule,
    AuthModule,
    GmvModule,
    MerchantModule,
    MerchantSalesModule,
    MovementModule,
    OverviewModule,
    RefundModule,
    ZeroSalesModule,
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10 // 10 requests per second max per IP
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50 // 50 requests per 10 seconds max per IP
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200 // 200 requests per minute max per IP
      }
    ])
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard // Rate-limit first: count ALL requests including unauthorized
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard // Auth second: reject invalid tokens after counting
    }
  ]
})
export class AppModule {}
