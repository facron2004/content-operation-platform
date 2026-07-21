import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OverviewService } from './overview.service';
import {
  OverviewDistributionQueryDto,
  OverviewKpiQueryDto,
  OverviewTopOffendersQueryDto,
  OverviewTrendQueryDto
} from './overview.dto';

@ApiTags('overview')
@Controller('api/overview')
export class OverviewController {
  constructor(@Inject(OverviewService) private readonly overview: OverviewService) {}

  @Get('kpis')
  @ApiOperation({
    summary: '?? KPI ??',
    description: '???/? SKU/?????/?? GMV ? 6 ?'
  })
  getKpis(@Query() query: OverviewKpiQueryDto) {
    return this.overview.getKpis(query.date);
  }

  @Get('trend')
  @ApiOperation({ summary: '7/30 ?????', description: '[{date, gmv, paidOrderCount}]' })
  getTrend(@Query() query: OverviewTrendQueryDto) {
    return this.overview.getTrend(query.days, query.endDate);
  }

  @Get('distribution')
  @ApiOperation({ summary: '??/??/stale ????' })
  getDistribution(@Query() query: OverviewDistributionQueryDto) {
    return this.overview.getDistribution(query.dim, query.limit);
  }

  @Get('top-offenders')
  @ApiOperation({ summary: '????? Top N?? stale_30d SKU ??' })
  getTopOffenders(@Query() query: OverviewTopOffendersQueryDto) {
    return this.overview.getTopOffenders(query.limit);
  }
}
