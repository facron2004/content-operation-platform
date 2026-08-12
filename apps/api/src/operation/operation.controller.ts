import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { OperationWorkbenchQueryDto } from './operation-workbench.dto';
import { OperationWorkbenchService } from './operation-workbench.service';

@ApiTags('operation')
@RequireLogin()
@Controller('api/operation')
export class OperationController {
  constructor(
    @Inject(OperationWorkbenchService)
    private readonly workbench: OperationWorkbenchService
  ) {}

  @Get('workbench')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'V2.0 经营工作台', description: '经营指标、趋势和待处理事项聚合' })
  getWorkbench(
    @Query(createDtoPipe(OperationWorkbenchQueryDto)) query: OperationWorkbenchQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.workbench.getWorkbench(query.date);
  }
}
