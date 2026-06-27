import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { UserRole } from '@content/shared';
import { ContentService } from './content.service';
import { DashboardService } from './dashboard.service';
import { OpsTodayQueryDto } from './content.dto';

@ApiTags('dashboard')
@Controller('api/content')
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboardService: DashboardService,
    // ContentService 用于包"获取推荐数据"回调,传给 DashboardService(避免 dashboard 依赖 content)
    @Inject(ContentService) private readonly contentService: ContentService,
  ) {}

  @Get('dashboard/summary')
  @ApiOperation({ summary: '仪表盘摘要', description: '文稿数量、GMV、转化率、套餐状态分布' })
  getDashboardSummary() {
    return this.dashboardService.getDashboardSummary(
      (q) => this.contentService.getRecommendations(q)
    );
  }

  @Get('ops/today')
  @ApiOperation({
    summary: '今日运营作战台',
    description: '必推/风险/爆款/滞销/社群任务/昨日复盘一览'
  })
  getTodayOperationConsole(@Query() query: OpsTodayQueryDto) {
    return this.dashboardService.getTodayOperationConsole(
      query.role,
      (q) => this.contentService.getRecommendations(q)
    );
  }

  @Get('ops/review')
  async getOperationReview(@Query('date') date?: string, @Query('role') role?: string) {
    const validRole = (role && ['platform_operator', 'area_operator', 'merchant_operator', 'auditor', 'admin'].includes(role))
      ? role as UserRole
      : undefined;
    const result = await this.dashboardService.getTodayOperationConsole(
      validRole,
      (q) => this.contentService.getRecommendations(q)
    );
    return { ...result.yesterdayReview, date: date ?? result.yesterdayReview.date };
  }

  @Get('performance')
  getPerformance() {
    return this.dashboardService.getPerformance((q) => this.contentService.getRecommendations(q));
  }
}
