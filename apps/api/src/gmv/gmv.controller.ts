/** Consolidated GMV module. */
import { beijingDateKey } from '@content/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { hasForceSignal } from '../common';
import { createDtoPipe } from '../common/dto-pipe';
import { assertInclusiveDaySpan, daySpanErrorCode, daySpanErrorSpan } from '../domain/sales-daily';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
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

/** Max inclusive day span for interactive GMV refresh (prevents multi-year ETL storms). */
export const GMV_REFRESH_MAX_DAYS = 90;

// --- gmv-controller-refresh.ts ---
export interface ValidatedGmvRefreshRange {
  startDate: string;
  endDate: string;
}

/** Validate a refresh body's date span. Throws BadRequestException on invalid input. */
export function validateGmvRefreshRange(body: GmvRefreshBodyDto): ValidatedGmvRefreshRange {
  const today = beijingDateKey(new Date());
  const endDate = body.endDate ?? today;
  const startDate = body.startDate ?? endDate;
  try {
    assertInclusiveDaySpan(startDate, endDate, GMV_REFRESH_MAX_DAYS);
  } catch (err) {
    const code = daySpanErrorCode(err);
    if (code === 'START_AFTER_END') {
      throw new BadRequestException('startDate 必须 ≤ endDate');
    }
    if (code === 'SPAN_TOO_LONG') {
      const span = daySpanErrorSpan(err) ?? GMV_REFRESH_MAX_DAYS + 1;
      throw new BadRequestException(
        `刷新区间不能超过 ${GMV_REFRESH_MAX_DAYS} 天（当前 ${span} 天）。更长回填请走 CLI/作业。`
      );
    }
    throw new BadRequestException('startDate/endDate 必须为 YYYY-MM-DD 格式');
  }
  return { startDate, endDate };
}

/**
 * Start an async GMV refresh job and return immediately with its id.
 * The heavy JeeSite pull + money recompute runs in the background; the client
 * polls GET /api/gmv/refresh/:jobId for progress (fixes 30-day "请求超时" — the
 * work can exceed the SPA's 120s HTTP timeout, but the job outlives the request).
 */
export function startGmvRefresh(service: GmvService, body: GmvRefreshBodyDto) {
  const { startDate, endDate } = validateGmvRefreshRange(body);
  const job = service.startRefreshJob(startDate, endDate);
  return {
    jobId: job.jobId,
    startDate: job.startDate,
    endDate: job.endDate,
    status: job.status
  };
}

/** Fetch the current state of a refresh job, or 404 if unknown/expired. */
export async function getGmvRefreshJobStatus(service: GmvService, jobId: string) {
  const job = await service.getRefreshJob(jobId);
  if (!job) throw new NotFoundException(`刷新任务不存在或已过期: ${jobId}`);
  return job;
}

export async function handleGmvRefresh(service: GmvService, body: GmvRefreshBodyDto) {
  const { startDate, endDate } = validateGmvRefreshRange(body);
  const result = await service.refreshFromJeesite(startDate, endDate);
  // Cache already invalidated at end of money recompute. Non-force getKpis
  // cold-loads once and shares in-flight with concurrent SPA tabs — force=true
  // would start a second OH multi-query storm racing those tabs (residual #85).
  const kpi = await service.getKpis(endDate, false);
  return { ...result, kpi };
}

// --- gmv.controller.ts ---
@ApiTags('gmv')
@RequireLogin()
@Controller('api/gmv')
export class GmvController {
  constructor(@Inject(GmvService) private readonly service: GmvService) {}

  @Get('today')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 40, ttl: 60000 } })
  @ApiOperation({
    summary: '今日 GMV KPI',
    description: 'GMV=paidAmount+paidAmountWallet;净GMV=GMV−refund;含本月累计/客单价/环比'
  })
  today(@Query(createDtoPipe(GmvTodayQueryDto)) q: GmvTodayQueryDto, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return gmvToday(this.service, q, req);
  }

  @Get('trend')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 40, ttl: 60000 } })
  @ApiOperation({ summary: 'GMV 趋势（按日/周/月）' })
  trend(@Query(createDtoPipe(GmvTrendQueryDto)) q: GmvTrendQueryDto, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return gmvTrend(this.service, q, req);
  }

  @Get('hourly')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 40, ttl: 60000 } })
  @ApiOperation({ summary: '分时段成交趋势（按支付小时，北京时间）' })
  hourly(@Query(createDtoPipe(GmvHourlyQueryDto)) q: GmvHourlyQueryDto, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return gmvHourly(this.service, q, req);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('cache/invalidate')
  @ApiOperation({ summary: '清空 GMV 进程内缓存' })
  invalidateCache(@Query('prefix') prefix?: string) {
    // Bound free-form prefix so a huge query string cannot thrash the cache key walk.
    const safePrefix =
      typeof prefix === 'string' && prefix.length > 0 ? prefix.slice(0, 64) : undefined;
    this.service.invalidateCache(safePrefix);
    return { ok: true, prefix: safePrefix ?? '(all)' };
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @RequireIdempotency('data-backfill')
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @ApiOperation({
    summary: 'JeSite 拉单 + 清缓存 + 重算 GMV（异步）',
    description:
      '立即返回 jobId，后台执行拉单与重算；用 GET /api/gmv/refresh/:jobId 轮询进度，避免长区间（如30天）触发 SPA 120s 请求超时。'
  })
  refresh(@Body(createDtoPipe(GmvRefreshBodyDto)) body: GmvRefreshBodyDto) {
    return startGmvRefresh(this.service, body);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 120, ttl: 60000 } })
  @Get('refresh/:jobId')
  @ApiOperation({ summary: '查询 GMV 回填/刷新任务的进度与结果' })
  async refreshStatus(@Param('jobId') jobId: string) {
    return getGmvRefreshJobStatus(this.service, jobId);
  }

  @Get('distribution')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 40, ttl: 60000 } })
  @ApiOperation({ summary: '区域/品类/渠道 GMV 分布' })
  distribution(
    @Query(createDtoPipe(GmvDistributionQueryDto)) q: GmvDistributionQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return gmvDistribution(this.service, q, req);
  }

  @Get('by-merchant')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 40, ttl: 60000 } })
  @ApiOperation({ summary: '商家 GMV / 退款率 / 核销率排行' })
  byMerchant(
    @Query(createDtoPipe(GmvByMerchantQueryDto)) q: GmvByMerchantQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return gmvByMerchant(this.service, q, req);
  }
}
