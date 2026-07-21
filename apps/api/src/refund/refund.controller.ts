/** Consolidated refund module. */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefundTodayQueryDto, RefundTopMerchantsQueryDto, RefundTrendQueryDto } from './refund.dto';
import { RefundService } from './refund.service';

@ApiTags('refund-verify')
@Controller('api')
export class RefundController {
  constructor(@Inject(RefundService) private readonly service: RefundService) {}

  @Get('refund/today')
  @ApiOperation({ summary: '今日退款 KPI + Top 退款商家' })
  today(@Query() q: RefundTodayQueryDto) {
    return this.service.getRefundToday(q.date);
  }

  @Get('refund/trend')
  @ApiOperation({ summary: '7/30 日退款率趋势' })
  trend(@Query() q: RefundTrendQueryDto) {
    return this.service.getRefundTrend(q.days, q.endDate);
  }

  @Get('refund/top-merchants')
  @ApiOperation({ summary: '高退款商家排行' })
  topMerchants(@Query() q: RefundTopMerchantsQueryDto) {
    return this.service.getTopMerchants(q);
  }

  @Get('verify/today')
  @ApiOperation({ summary: '今日核销 KPI + Top 核销商家' })
  verifyToday(@Query() q: RefundTodayQueryDto) {
    return this.service.getVerifyToday(q.date);
  }

  @Get('verify/trend')
  @ApiOperation({ summary: '7/30 日核销率趋势' })
  verifyTrend(@Query() q: RefundTrendQueryDto) {
    return this.service.getVerifyTrend(q.days, q.endDate);
  }
}
