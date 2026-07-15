import { Body, Controller, Get, Header, Inject, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MerchantSalesService, MERCHANT_SALES_SERVICE } from './merchant-sales.service';
import { MerchantSalesQueryDto, MerchantSalesRefreshDto } from './dto/merchant-sales-query.dto';

@ApiTags('merchant-sales')
@Controller('api/merchant-sales')
export class MerchantSalesController {
  constructor(@Inject(MERCHANT_SALES_SERVICE) private readonly service: MerchantSalesService) {}

  @Get('summary')
  @ApiOperation({ summary: '商家销售数据 — 汇总 KPI(日/周/月/年)' })
  summary(@Query() query: MerchantSalesQueryDto, @Req() req: Request) {
    return this.service.getSummary(
      query.window,
      query.date,
      query.endDate,
      hasForceSignal(req, query)
    );
  }

  @Get('ranking')
  @ApiOperation({ summary: '商家销售数据 — 商家排行(分页)' })
  ranking(@Query() query: MerchantSalesQueryDto, @Req() req: Request) {
    return this.service.getRanking(
      query.window,
      query.date,
      query.endDate,
      query.sortBy,
      query.page,
      query.pageSize,
      hasForceSignal(req, query)
    );
  }

  @Get('trend')
  @ApiOperation({ summary: '商家销售数据 — 时序(周/月/年)' })
  trend(@Query() query: MerchantSalesQueryDto, @Req() req: Request) {
    // day 窗口强制走汇总,不返回 trend
    const window = query.window === 'day' ? 'week' : query.window;
    return this.service.getTrend(
      window as Exclude<typeof query.window, 'day'>,
      query.date,
      query.endDate,
      hasForceSignal(req, query)
    );
  }

  @Get('export')
  @ApiOperation({ summary: '商家销售数据 — CSV 导出' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="merchant-sales.csv"')
  async export(@Query() query: MerchantSalesQueryDto) {
    const csv = await this.service.getExport(query.window, query.date, query.endDate, query.sortBy);
    return csv;
  }

  @Post('refresh')
  @ApiOperation({
    summary: '商家销售数据 — 手动触发区间重算',
    description: '默认重算今天;可指定 startDate/endDate (YYYY-MM-DD)'
  })
  async refresh(@Body() body: MerchantSalesRefreshDto = {}) {
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const startDate = body.startDate ?? today;
    const endDate = body.endDate ?? today;
    return this.service.recomputeRange(startDate, endDate);
  }

  @Get('cache/invalidate')
  @ApiOperation({ summary: '清空商家销售进程内缓存' })
  invalidateCache() {
    this.service.invalidateCache();
    return { ok: true };
  }
}

/** 复用 gmv.controller.ts:67-72 的强刷识别逻辑 */
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
