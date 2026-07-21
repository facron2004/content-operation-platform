/** Consolidated GMV module. */
import { beijingDateKey } from '@content/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { hasForceSignal } from '../common';
import {
  GmvByMerchantQueryDto,
  GmvDistributionQueryDto,
  GmvHourlyQueryDto,
  GmvRefreshBodyDto,
  GmvTodayQueryDto,
  GmvTrendQueryDto
} from './gmv.dto';
import { GmvService } from './gmv.service';

// --- gmv-controller-reads.ts ---
export function gmvToday(service: GmvService, q: GmvTodayQueryDto, req: Request) {
  return service.getKpis(q.date, hasForceSignal(req, q));
}

export function gmvTrend(service: GmvService, q: GmvTrendQueryDto, req: Request) {
  return service.getTrend(q.days, q.endDate, hasForceSignal(req, q), q.granularity ?? 'day');
}

export function gmvHourly(service: GmvService, q: GmvHourlyQueryDto, req: Request) {
  return service.getHourly(q.date, hasForceSignal(req, q));
}

export function gmvDistribution(service: GmvService, q: GmvDistributionQueryDto, req: Request) {
  return service.getDistribution(q.dim, q.limit, hasForceSignal(req, q));
}

export function gmvByMerchant(service: GmvService, q: GmvByMerchantQueryDto, req: Request) {
  return service.getTopMerchants(q.sortBy, q.page, q.pageSize, hasForceSignal(req, q));
}

// --- gmv-controller-refresh.ts ---
export async function handleGmvRefresh(service: GmvService, body: GmvRefreshBodyDto) {
  const today = beijingDateKey(new Date());
  const endDate = body.endDate ?? today;
  const startDate = body.startDate ?? endDate;
  if (startDate > endDate) throw new BadRequestException('startDate 必须 ≤ endDate');
  const result = await service.refreshFromJeesite(startDate, endDate);
  const kpi = await service.getKpis(endDate, true);
  return { ...result, kpi };
}

// --- gmv.controller.ts ---
@ApiTags('gmv')
@Controller('api/gmv')
export class GmvController {
  constructor(@Inject(GmvService) private readonly service: GmvService) {}

  @Get('today')
  @ApiOperation({
    summary: '今日 GMV KPI',
    description: 'GMV=paidAmount+paidAmountWallet;净GMV=GMV−refund;含本月累计/客单价/环比'
  })
  today(@Query() q: GmvTodayQueryDto, @Req() req: Request) {
    return gmvToday(this.service, q, req);
  }

  @Get('trend')
  @ApiOperation({ summary: 'GMV 趋势（按日/周/月）' })
  trend(@Query() q: GmvTrendQueryDto, @Req() req: Request) {
    return gmvTrend(this.service, q, req);
  }

  @Get('hourly')
  @ApiOperation({ summary: '分时段成交趋势（按支付小时，北京时间）' })
  hourly(@Query() q: GmvHourlyQueryDto, @Req() req: Request) {
    return gmvHourly(this.service, q, req);
  }

  @Post('cache/invalidate')
  @ApiOperation({ summary: '清空 GMV 进程内缓存' })
  invalidateCache(@Query('prefix') prefix?: string) {
    this.service.invalidateCache(prefix);
    return { ok: true, prefix: prefix ?? '(all)' };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'JeSite 拉单 + 清缓存 + 重算 GMV' })
  refresh(@Body() body: GmvRefreshBodyDto) {
    return handleGmvRefresh(this.service, body);
  }

  @Get('distribution')
  @ApiOperation({ summary: '区域/品类/渠道 GMV 分布' })
  distribution(@Query() q: GmvDistributionQueryDto, @Req() req: Request) {
    return gmvDistribution(this.service, q, req);
  }

  @Get('by-merchant')
  @ApiOperation({ summary: '商家 GMV / 退款率 / 核销率排行' })
  byMerchant(@Query() q: GmvByMerchantQueryDto, @Req() req: Request) {
    return gmvByMerchant(this.service, q, req);
  }
}
