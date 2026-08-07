/** Data-analysis HTTP surface: summary + Excel export (砍价订单模板) + Freshness monitoring. */
import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { DataAnalysisQueryDto } from './data-analysis.dto';
import { DataAnalysisService } from './data-analysis.service';
import { DataFreshnessService } from './data-freshness.service';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';

@ApiTags('data-analysis')
@RequireLogin()
@Controller('api/data-analysis')
export class DataAnalysisController {
  constructor(
    @Inject(DataAnalysisService) private readonly service: DataAnalysisService,
    @Inject(DataFreshnessService) private readonly freshnessSvc: DataFreshnessService
  ) {}

  @Get('freshness')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: '数据分析 — 数据新鲜度评估',
    description: '获取底层指标/归因/定时任务表的更新延迟与新鲜度报告'
  })
  freshness(@Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.freshnessSvc.getFreshnessReport();
  }

  @Get('summary')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: '数据分析 — 汇总预览',
    description:
      '按日/周/月/年预览砍价订单分析：KPI 总览、时段/小时分布、业务员/商家排行 Top20、核销极值、退款 Top15（不生成文件，不拉明细行）'
  })
  summary(
    @Query(createDtoPipe(DataAnalysisQueryDto)) q: DataAnalysisQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.getSummary(q.window, q.date, q.endDate, q.detailLimit, q.rankingLimit);
  }

  @Get('export')
  @RequirePermissions('analytics:export')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: '数据分析 — 导出 Excel',
    description:
      '砍价订单数据分析 xlsx：总览 / 时段分布 / 业务员排行 / 商家排行 / 核销率分析 / 退款分析 / 订单明细'
  })
  async export(
    @Query(createDtoPipe(DataAnalysisQueryDto)) q: DataAnalysisQueryDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    assertUnrestrictedAnalytics(req);
    const { buffer, filename } = await this.service.exportExcel(
      q.window,
      q.date,
      q.endDate,
      q.detailLimit,
      q.rankingLimit
    );
    const asciiName = filename.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
}
