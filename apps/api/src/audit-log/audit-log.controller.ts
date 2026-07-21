import { Controller, Get, Param, Query, Inject, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';

@ApiTags('audit-logs')
@Controller('api/audit-logs')
export class AuditLogController {
  private readonly logger = new Logger(AuditLogController.name);

  constructor(@Inject(AuditLogService) private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs with pagination and filters' })
  listLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('objectType') objectType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    const p = Number(page);
    const ps = Number(pageSize);
    return this.auditLogService.list({
      userId,
      action,
      objectType,
      dateFrom,
      dateTo,
      page: Number.isFinite(p) ? p : undefined,
      pageSize: Number.isFinite(ps) ? ps : undefined
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single audit log detail' })
  getLog(@Param('id') id: string) {
    return this.auditLogService.findById(id);
  }
}
