import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ContentModule } from './content/content.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule, JwtAuthGuard } from './auth';
import { GlobalExceptionFilter } from './common';
import { BigIntSerializerInterceptor } from './common/bigint-serializer.interceptor';
import { GmvModule } from './gmv/gmv.module';
import { MerchantModule } from './merchant/merchant.module';
import { MerchantSalesModule } from './merchant-sales/merchant-sales.module';
import { MovementModule } from './movement/movement.module';
import { OverviewModule } from './overview/overview.module';
import { RefundModule } from './refund/refund.module';
import { ZeroSalesModule } from './zero-sales/zero-sales.module';
import { CampaignModule } from './campaign/campaign.module';
import { CommunityModule } from './community/community.module';
import { DistributionTaskModule } from './distribution-task/distribution-task.module';
import { AttributionModule } from './attribution/attribution.module';
import { JobsModule } from './jobs/jobs.module';
import { UserAccessModule } from './user-access/user-access.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { RolesGuard } from './user-access/role.guard';
import { appThrottlerConfig } from './app-throttler.config';

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
    CampaignModule,
    CommunityModule,
    DistributionTaskModule,
    AttributionModule,
    JobsModule,
    UserAccessModule,
    AuditLogModule,
    ThrottlerModule.forRoot(appThrottlerConfig)
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule {}
