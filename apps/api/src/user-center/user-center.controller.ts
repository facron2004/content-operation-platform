import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { safePathId } from '../common/path-id';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { UserCenterListQueryDto } from './user-center.dto';
import { UserCenterService } from './user-center.service';
import { UserLifecycleQueryDto } from './user-lifecycle.dto';
import { UserLifecycleService } from './user-lifecycle.service';

@ApiTags('user-center')
@RequireLogin()
@Controller('api/user-center')
export class UserCenterController {
  constructor(
    @Inject(UserCenterService) private readonly service: UserCenterService,
    @Inject(UserLifecycleService) private readonly lifecycle: UserLifecycleService
  ) {}

  @Get('lifecycle')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '用户生命周期', description: '按付费行为识别用户阶段并提供分层列表' })
  lifecycleOverview(
    @Query(createDtoPipe(UserLifecycleQueryDto)) query: UserLifecycleQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.lifecycle.getOverview(query);
  }

  @Get('members')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '用户中心列表', description: '客户用户分页、等级筛选和经营摘要' })
  list(
    @Query(createDtoPipe(UserCenterListQueryDto)) query: UserCenterListQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.listMembers(query);
  }

  @Get('members/:memberId')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '用户中心详情', description: '客户用户档案、订单和积分流水' })
  async detail(
    @Param('memberId') memberId: string,
    @Query('inviteCode') inviteCode: string | undefined,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    const id = safePathId(memberId);
    return this.service.getMember(id, inviteCode?.trim() || undefined);
  }
}
