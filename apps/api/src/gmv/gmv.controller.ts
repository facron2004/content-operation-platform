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
import { GmvService } from './gmv.service';
import {
  GmvByMerchantQueryDto,
  GmvDistributionQueryDto,
  GmvTodayQueryDto,
  GmvTrendQueryDto
} from './dto/gmv-query.dto';
import { GmvRefreshBodyDto } from './dto/gmv-refresh.dto';

@ApiTags('gmv')
@Controller('api/gmv')
export class GmvController {
  constructor(@Inject(GmvService) private readonly service: GmvService) {}

  @Get('today')
  @ApiOperation({
    summary: '今日 GMV 看板 KPI',
    description: 'GMV = paidAmountOnline + Wallet + Bonus;净 GMV = GMV − refundAmount'
  })
  today(@Query() query: GmvTodayQueryDto, @Req() req: Request) {
    return this.service.getKpis(query.date, hasForceSignal(req, query));
  }

  @Get('trend')
  @ApiOperation({ summary: '7/30 日 GMV 趋势' })
  trend(@Query() query: GmvTrendQueryDto, @Req() req: Request) {
    const force = hasForceSignal(req, query);
    return this.service.getTrend(query.days, query.endDate, force);
  }

  @Get('cache/invalidate')
  @ApiOperation({ summary: '清空 GMV 进程内缓存' })
  invalidateCache(@Query('prefix') prefix?: string) {
    this.service.invalidateCache(prefix);
    return { ok: true, prefix: prefix ?? '(all)' };
  }

  @Post('refresh')
  @ApiOperation({
    summary: '从 JeSite 拉订单 + 清缓存 + 重算 GMV',
    description: '刷新按钮用:默认拉今天,也可指定 startDate/endDate (YYYY-MM-DD)'
  })
  async refresh(@Body() body: GmvRefreshBodyDto) {
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const endDate = body.endDate ?? today;
    const startDate = body.startDate ?? endDate;
    if (startDate > endDate) {
      throw new BadRequestException('startDate 必须 ≤ endDate');
    }
    const result = await this.service.refreshFromJeesite(startDate, endDate);
    // 刷新后立刻算一次末尾日 KPI(强制 force,绕过刚清的 cache)
    const kpi = await this.service.getKpis(endDate, true);
    return { ...result, kpi };
  }

  @Get('distribution')
  @ApiOperation({ summary: '区域/品类/渠道维度 GMV 分布' })
  distribution(@Query() query: GmvDistributionQueryDto, @Req() req: Request) {
    const force = hasForceSignal(req, query);
    return this.service.getDistribution(query.dim, query.limit, force);
  }

  @Get('by-merchant')
  @ApiOperation({ summary: '商家 GMV / 退款率 / 核销率排行' })
  byMerchant(@Query() query: GmvByMerchantQueryDto, @Req() req: Request) {
    const force = hasForceSignal(req, query);
    return this.service.getTopMerchants(query.sortBy, query.page, query.pageSize, force);
  }
}

/** 识别"绕过缓存"信号: ?force=true/1/yes 或 ?_=ts / ?_t=ts / ?t=ts 任一存在都视为 force=true */
function hasForceSignal(req: Request, query: { force?: boolean | string }): boolean {
  const q = req.query as Record<string, unknown>;
  if (
    query.force === true ||
    query.force === 'true' ||
    query.force === '1' ||
    query.force === 'yes'
  )
    return true;
  if (q['_'] != null || q['_t'] != null || q['t'] != null) return true;
  return false;
}
