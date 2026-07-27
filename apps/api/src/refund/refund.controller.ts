/** Consolidated refund module. */
import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RefundTodayQueryDto, RefundTopMerchantsQueryDto, RefundTrendQueryDto } from './refund.dto';
import { RefundService } from './refund.service';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { createDtoPipe } from '../common/dto-pipe';

@ApiTags('refund-verify')
@Controller('api')
export class RefundController {
  constructor(@Inject(RefundService) private readonly service: RefundService) {}

  @Get('refund/today')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '今日退款 KPI + Top 退款商家' })
  today(@Query(createDtoPipe(RefundTodayQueryDto)) q: RefundTodayQueryDto, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.service.getRefundToday(q.date);
  }

  @Get('refund/trend')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '7/30 日退款率趋势' })
  trend(@Query(createDtoPipe(RefundTrendQueryDto)) q: RefundTrendQueryDto, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.service.getRefundTrend(q.days, q.endDate);
  }

  @Get('refund/top-merchants')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '高退款商家排行' })
  topMerchants(
    @Query(createDtoPipe(RefundTopMerchantsQueryDto)) q: RefundTopMerchantsQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getTopMerchants(q);
  }

  @Get('verify/today')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '今日核销 KPI + Top 核销商家' })
  verifyToday(
    @Query(createDtoPipe(RefundTodayQueryDto)) q: RefundTodayQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getVerifyToday(q.date);
  }

  @Get('verify/trend')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '7/30 日核销率趋势' })
  verifyTrend(
    @Query(createDtoPipe(RefundTrendQueryDto)) q: RefundTrendQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getVerifyTrend(q.days, q.endDate);
  }
}
