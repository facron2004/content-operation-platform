import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ContentModule } from './content/content.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule, JwtAuthGuard } from './auth';
import { GlobalExceptionFilter } from './common';
import { BigIntSerializerInterceptor } from './common/bigint-serializer.interceptor';
import { MoneyViewInterceptor } from './money/money-view.interceptor';
import { GmvModule } from './gmv/gmv.module';
import { MerchantModule } from './merchant/merchant.module';
import { MerchantSalesModule } from './merchant-sales/merchant-sales.module';
import { MovementModule } from './movement/movement.module';
import { OverviewModule } from './overview/overview.module';
import { DataAnalysisModule } from './data-analysis/data-analysis.module';
import { RefundModule } from './refund/refund.module';
import { ZeroSalesModule } from './zero-sales/zero-sales.module';
import { CampaignModule } from './campaign/campaign.module';
import { CommunityModule } from './community/community.module';
import { DistributionTaskModule } from './distribution-task/distribution-task.module';
import { AttributionModule } from './attribution/attribution.module';
import { JobsModule } from './jobs/jobs.module';
import { UserAccessModule } from './user-access/user-access.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { OutboxModule } from './outbox/outbox.module';
import { AuditLogInterceptor } from './audit-log/audit-log.interceptor';
import { RolesGuard } from './user-access/role.guard';
import { PermissionGuard } from './user-access/iam';
import { appThrottlerConfig } from './app-throttler.config';
import { SystemVersionController } from './common/system-version.controller';
import { HealthController } from './common/health.controller';
import { ReadinessService } from './common/readiness.service';

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
    DataAnalysisModule,
    RefundModule,
    ZeroSalesModule,
    CampaignModule,
    CommunityModule,
    DistributionTaskModule,
    AttributionModule,
    JobsModule,
    UserAccessModule,
    AuditLogModule,
    IdempotencyModule,
    OutboxModule,
    ThrottlerModule.forRoot(appThrottlerConfig)
  ],
  controllers: [SystemVersionController, HealthController],
  providers: [
    ReadinessService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    // 金额读路径增强：*Fen 字符串化 + 追加 *Display（PRD §7.4.4 阶段五）。须位于 BigIntSerializer 之后。
    { provide: APP_INTERCEPTOR, useClass: MoneyViewInterceptor },
    // Capture POST/PATCH/PUT/DELETE mutations into OperationAuditLog (bodies redacted).
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionGuard }
  ]
})
export class AppModule {}
