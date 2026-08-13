import { createDtoPipe } from '../common/dto-pipe';
import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { hasForceSignal } from '../common';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { OverviewService } from './overview.service';
import {
  OverviewDistributionQueryDto,
  OverviewKpiQueryDto,
  OverviewTopOffendersQueryDto,
  OverviewTrendQueryDto
} from './overview.dto';

@ApiTags('overview')
@RequireLogin()
@Controller('api/overview')
export class OverviewController {
  constructor(@Inject(OverviewService) private readonly overview: OverviewService) {}

  // Cold KPI/top-offenders share heavy gate; tighten long limit vs multi-tab home paint.
  @Get('kpis')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '总览 KPI',
    description: '平台级汇总 KPI'
  })
  getKpis(
    @Query(createDtoPipe(OverviewKpiQueryDto)) query: OverviewKpiQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.overview.getKpis(query.date, hasForceSignal(req, query));
  }

  @Get('trend')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '7/30 日趋势', description: '[{date, gmv, paidOrderCount}]' })
  getTrend(
    @Query(createDtoPipe(OverviewTrendQueryDto)) query: OverviewTrendQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.overview.getTrend(query.days, query.endDate, hasForceSignal(req, query));
  }

  @Get('distribution')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '区域/品类/stale 分布' })
  getDistribution(
    @Query(createDtoPipe(OverviewDistributionQueryDto)) query: OverviewDistributionQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.overview.getDistribution(
      query.dim,
      query.limit,
      hasForceSignal(req, query),
      query.date
    );
  }

  @Get('top-offenders')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: '异常商家 Top N / stale_30d SKU' })
  getTopOffenders(
    @Query(createDtoPipe(OverviewTopOffendersQueryDto)) query: OverviewTopOffendersQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.overview.getTopOffenders(query.limit, hasForceSignal(req, query), query.date);
  }
}
