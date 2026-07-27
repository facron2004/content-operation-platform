import { createDtoPipe } from '../common/dto-pipe';
import { Controller, Get, Param, Query, Inject, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../user-access/role.decorator';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { safePathId } from '../common/path-id';

@ApiTags('audit-logs')
@Controller('api/audit-logs')
export class AuditLogController {
  private readonly logger = new Logger(AuditLogController.name);

  constructor(@Inject(AuditLogService) private readonly auditLogService: AuditLogService) {}

  @Roles('admin', 'platform_operator', 'auditor')
  // COUNT + ORDER BY over OperationAuditLog — throttle concurrent tab fans.
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: 'List audit logs with pagination and filters' })
  listLogs(@Query(createDtoPipe(AuditLogQueryDto)) query: AuditLogQueryDto) {
    return this.auditLogService.list({
      userId: query.userId,
      action: query.action,
      objectType: query.objectType,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      pageSize: query.pageSize
    });
  }

  @Roles('admin', 'platform_operator', 'auditor')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @Get(':id')
  @ApiOperation({ summary: 'Single audit log detail' })
  getLog(@Param('id') id: string) {
    return this.auditLogService.findById(safePathId(id));
  }
}
