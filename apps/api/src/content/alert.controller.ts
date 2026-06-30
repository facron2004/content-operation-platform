import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { OperationAlert, OperationAlertType } from '@content/shared';
import { AlertService } from './alert.service';
import { ContentService } from './content.service';
import { AlertResolveDto, AlertResolveBatchDto, AlertQueryDto } from './content.dto';

@ApiTags('alerts')
@Controller('api/content')
export class AlertController {
  constructor(
    @Inject(AlertService) private readonly alertService: AlertService,
    // ContentService 用于包"获取推荐数据"回调,传给 AlertService(避免 alert 依赖 content)
    @Inject(ContentService) private readonly contentService: ContentService
  ) {}

  @Get('alerts')
  getOperationAlerts(@Query() query: AlertQueryDto) {
    return this.alertService.getOperationAlerts(
      {
        role: query.role,
        level: query.level as OperationAlert['level'] | undefined,
        type: query.type as OperationAlertType | undefined,
        keyword: query.keyword,
        page: query.page,
        pageSize: query.pageSize
      },
      (q) => this.contentService.getRecommendations(q)
    );
  }

  @Post('alerts/:alertId/resolve')
  resolveAlert(@Param('alertId') alertId: string, @Body() body?: AlertResolveDto) {
    return this.alertService.resolveOperationAlert(alertId, body?.resolvedBy);
  }

  @Post('alerts/resolve-batch')
  resolveAlerts(@Body() body: AlertResolveBatchDto) {
    return this.alertService.resolveOperationAlerts(body.alertIds ?? [], body.resolvedBy);
  }
}
