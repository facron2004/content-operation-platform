/** Consolidated refund module. */
import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RefundTodayQueryDto, RefundTopMerchantsQueryDto, RefundTrendQueryDto } from './refund.dto';
import { RefundService } from './refund.service';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { createDtoPipe, hasForceSignal } from '../common';

@ApiTags('refund-verify')
@RequireLogin()
@Controller('api')
export class RefundController {
  constructor(@Inject(RefundService) private readonly service: RefundService) {}

  @Get('refund/today')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '今日退款 KPI + Top 退款商家' })
  today(@Query(createDtoPipe(RefundTodayQueryDto)) q: RefundTodayQueryDto, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.service.getRefundToday(q, hasForceSignal(req, q));
  }

  @Get('refund/trend')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '7/30 日退款率趋势' })
  trend(@Query(createDtoPipe(RefundTrendQueryDto)) q: RefundTrendQueryDto, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.service.getRefundTrend(q, hasForceSignal(req, q));
  }

  @Get('refund/top-merchants')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '高退款商家排行' })
  topMerchants(
    @Query(createDtoPipe(RefundTopMerchantsQueryDto)) q: RefundTopMerchantsQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getTopMerchants(q, hasForceSignal(req, q));
  }

  @Get('verify/today')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '今日核销 KPI + Top 核销商家' })
  verifyToday(
    @Query(createDtoPipe(RefundTodayQueryDto)) q: RefundTodayQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getVerifyToday(q, hasForceSignal(req, q));
  }

  @Get('verify/trend')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '7/30 日核销率趋势' })
  verifyTrend(
    @Query(createDtoPipe(RefundTrendQueryDto)) q: RefundTrendQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getVerifyTrend(q, hasForceSignal(req, q));
  }
}
