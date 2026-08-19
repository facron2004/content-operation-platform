import { Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { safePathId } from '../common/path-id';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { Roles } from '../user-access/role.decorator';
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

  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('members/refresh')
  @ApiOperation({
    summary: '异步刷新 JeeSite 会员目录',
    description: '单线程逐页拉取并持久化，返回 jobId；刷新失败时保留上一次成功目录，不删除旧数据。'
  })
  startRefresh() {
    const job = this.service.startRefreshJob();
    return {
      jobId: job.jobId,
      kind: job.kind,
      generation: job.generation,
      status: job.status,
      progress: job.progress
    };
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('analytics:refresh')
  @Throttle({ long: { limit: 6, ttl: 60000 } })
  @Post('members/refresh/incremental')
  @ApiOperation({
    summary: '增量同步 JeeSite 会员目录',
    description:
      '复用当前活动快照，按 sourceCreatedAt 找到最新旧用户，读到该用户后停止，仅抓取其之前的新增会员。无活动快照时退化为全量刷新。'
  })
  async startIncrementalRefresh() {
    const job = await this.service.startIncrementalRefreshJob();
    return {
      jobId: job.jobId,
      kind: job.kind,
      generation: job.generation,
      status: job.status,
      progress: job.progress
    };
  }

  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 120, ttl: 60000 } })
  @Get('members/refresh/active')
  @ApiOperation({ summary: '查询当前会员目录刷新任务' })
  activeRefresh() {
    return this.service.getActiveRefreshJob();
  }

  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 120, ttl: 60000 } })
  @Get('members/refresh/:jobId')
  @ApiOperation({ summary: '查询会员目录刷新任务进度' })
  async refreshStatus(@Param('jobId') jobId: string) {
    const job = await this.service.getRefreshJob(jobId);
    if (!job) throw new NotFoundException(`刷新任务不存在或已过期: ${jobId}`);
    return job;
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
