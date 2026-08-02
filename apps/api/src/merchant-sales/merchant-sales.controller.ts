/** Consolidated merchant-sales module. */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { beijingDateKey } from '@content/shared';
import type { Request, Response } from 'express';
import { hasForceSignal } from '../common';
import { createDtoPipe } from '../common/dto-pipe';
import { CSV_EXPORT_MAX_ROWS } from '../common/sql-chunk';
import { assertInclusiveDaySpan, daySpanErrorCode, daySpanErrorSpan } from '../domain/sales-daily';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { MerchantSalesQueryDto, MerchantSalesRefreshDto } from './merchant-sales.dto';
import { MERCHANT_SALES_SERVICE, MerchantSalesService } from './merchant-sales.service';

/** Max inclusive day span for interactive merchant-sales recompute. */
export const MERCHANT_SALES_REFRESH_MAX_DAYS = 90;

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
  const endDate = body.endDate ?? today;
  const startDate = body.startDate ?? endDate;
  try {
    assertInclusiveDaySpan(startDate, endDate, MERCHANT_SALES_REFRESH_MAX_DAYS);
  } catch (err) {
    const code = daySpanErrorCode(err);
    if (code === 'START_AFTER_END') {
      throw new BadRequestException('startDate 必须 ≤ endDate');
    }
    if (code === 'SPAN_TOO_LONG') {
      const span = daySpanErrorSpan(err) ?? MERCHANT_SALES_REFRESH_MAX_DAYS + 1;
      throw new BadRequestException(
        `重算区间不能超过 ${MERCHANT_SALES_REFRESH_MAX_DAYS} 天（当前 ${span} 天）`
      );
    }
    throw new BadRequestException('startDate/endDate 必须为 YYYY-MM-DD 格式');
  }
  return service.recomputeRange(startDate, endDate);
}

// --- merchant-sales.controller.ts ---
@ApiTags('merchant-sales')
@RequireLogin()
@Controller('api/merchant-sales')
export class MerchantSalesController {
  constructor(@Inject(MERCHANT_SALES_SERVICE) private readonly service: MerchantSalesService) {}
  @Get('summary')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '商家销售数据 — 汇总 KPI(日/周/月/年)' })
  summary(
    @Query(createDtoPipe(MerchantSalesQueryDto)) q: MerchantSalesQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return getMerchantSalesSummary(this.service, q, req);
  }
  @Get('ranking')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '商家销售数据 — 商家排行(分页)' })
  ranking(
    @Query(createDtoPipe(MerchantSalesQueryDto)) q: MerchantSalesQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return getMerchantSalesRanking(this.service, q, req);
  }
  @Get('trend')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '商家销售数据 — 时序(周/月/年)' })
  trend(
    @Query(createDtoPipe(MerchantSalesQueryDto)) q: MerchantSalesQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return getMerchantSalesTrend(this.service, q, req);
  }
  @Get('export')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '商家销售数据 — CSV 导出' })
  async export(
    @Query(createDtoPipe(MerchantSalesQueryDto)) q: MerchantSalesQueryDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    assertUnrestrictedAnalytics(req);
    // Residual #263: #262 parity — X-Export-* when CSV_EXPORT_MAX_ROWS clips.
    const result = await this.service.getExport(q.window, q.date, q.endDate, q.sortBy);
    if (result.truncated) {
      res.setHeader('X-Export-Truncated', '1');
      res.setHeader('X-Export-Limit', String(result.limit ?? CSV_EXPORT_MAX_ROWS));
      res.setHeader('X-Export-Total', String(result.total));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="merchant-sales.csv"');
    res.send(result.csv);
  }
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('refresh')
  @ApiOperation({
    summary: '商家销售数据 — 手动触发区间重算',
    description: '默认重算今天;可指定 startDate/endDate (YYYY-MM-DD)'
  })
  refresh(@Body(createDtoPipe(MerchantSalesRefreshDto)) body: MerchantSalesRefreshDto) {
    return refreshMerchantSales(this.service, body ?? {});
  }
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Post('cache/invalidate')
  @ApiOperation({ summary: '清空商家销售进程内缓存(POST 代替 GET)' })
  invalidateCache() {
    this.service.invalidateCache();
    return { ok: true };
  }
}
