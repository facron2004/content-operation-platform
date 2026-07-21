/** Consolidated merchant-sales module. */
import { Body, Controller, Get, Header, Inject, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { beijingDateKey } from '@content/shared';
import type { Request } from 'express';
import { hasForceSignal } from '../common';
import { MerchantSalesQueryDto, MerchantSalesRefreshDto } from './merchant-sales.dto';
import { MERCHANT_SALES_SERVICE, MerchantSalesService } from './merchant-sales.service';

// --- merchant-sales-controller-ops.ts ---
export function getMerchantSalesSummary(
  service: MerchantSalesService,
  query: MerchantSalesQueryDto,
  req: Request
) {
  return service.getSummary(query.window, query.date, query.endDate, hasForceSignal(req, query));
}
export function getMerchantSalesRanking(
  service: MerchantSalesService,
  query: MerchantSalesQueryDto,
  req: Request
) {
  return service.getRanking(
    query.window,
    query.date,
    query.endDate,
    query.sortBy,
    query.page,
    query.pageSize,
    hasForceSignal(req, query)
  );
}
export function getMerchantSalesTrend(
  service: MerchantSalesService,
  query: MerchantSalesQueryDto,
  req: Request
) {
  const window = query.window === 'day' ? 'week' : query.window;
  return service.getTrend(
    window as Exclude<typeof query.window, 'day'>,
    query.date,
    query.endDate,
    hasForceSignal(req, query)
  );
}
export function refreshMerchantSales(
  service: MerchantSalesService,
  body: MerchantSalesRefreshDto = {}
) {
  const today = beijingDateKey(new Date());
  return service.recomputeRange(body.startDate ?? today, body.endDate ?? today);
}

// --- merchant-sales.controller.ts ---
@ApiTags('merchant-sales')
@Controller('api/merchant-sales')
export class MerchantSalesController {
  constructor(@Inject(MERCHANT_SALES_SERVICE) private readonly service: MerchantSalesService) {}
  @Get('summary') @ApiOperation({ summary: '商家销售数据 — 汇总 KPI(日/周/月/年)' }) summary(
    @Query() q: MerchantSalesQueryDto,
    @Req() req: Request
  ) {
    return getMerchantSalesSummary(this.service, q, req);
  }
  @Get('ranking') @ApiOperation({ summary: '商家销售数据 — 商家排行(分页)' }) ranking(
    @Query() q: MerchantSalesQueryDto,
    @Req() req: Request
  ) {
    return getMerchantSalesRanking(this.service, q, req);
  }
  @Get('trend') @ApiOperation({ summary: '商家销售数据 — 时序(周/月/年)' }) trend(
    @Query() q: MerchantSalesQueryDto,
    @Req() req: Request
  ) {
    return getMerchantSalesTrend(this.service, q, req);
  }
  @Get('export')
  @ApiOperation({ summary: '商家销售数据 — CSV 导出' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="merchant-sales.csv"')
  export(@Query() q: MerchantSalesQueryDto) {
    return this.service.getExport(q.window, q.date, q.endDate, q.sortBy);
  }
  @Post('refresh')
  @ApiOperation({
    summary: '商家销售数据 — 手动触发区间重算',
    description: '默认重算今天;可指定 startDate/endDate (YYYY-MM-DD)'
  })
  refresh(@Body() body: MerchantSalesRefreshDto = {}) {
    return refreshMerchantSales(this.service, body);
  }
  @Post('cache/invalidate')
  @ApiOperation({ summary: '清空商家销售进程内缓存(POST 代替 GET)' })
  invalidateCache() {
    this.service.invalidateCache();
    return { ok: true };
  }
}
