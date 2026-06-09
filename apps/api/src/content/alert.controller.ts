import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { OperationAlert, UserRole } from '@content/shared';
import { ContentService } from './content.service';
import { AlertResolveDto, AlertResolveBatchDto } from './content.dto';

@ApiTags('alerts')
@Controller('api/content')
export class AlertController {
  constructor(@Inject(ContentService) private readonly contentService: ContentService) {}

  @Get('alerts')
  getOperationAlerts(
    @Query('role') role?: UserRole,
    @Query('level') level?: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.contentService.getOperationAlerts({
      role: role as UserRole,
      level: level as OperationAlert['level'],
      type: type as OperationAlert['type'],
      keyword,
      page: page !== undefined && page !== '' ? Number(page) : undefined,
      pageSize: pageSize !== undefined && pageSize !== '' ? Number(pageSize) : undefined
    });
  }

  @Post('alerts/:alertId/resolve')
  resolveAlert(@Param('alertId') alertId: string, @Body() body?: AlertResolveDto) {
    return this.contentService.resolveOperationAlert(alertId, body?.resolvedBy);
  }

  @Post('alerts/resolve-batch')
  resolveAlerts(@Body() body: AlertResolveBatchDto) {
    return this.contentService.resolveOperationAlerts(body.alertIds ?? [], body.resolvedBy);
  }
}