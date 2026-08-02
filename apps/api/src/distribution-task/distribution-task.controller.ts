import { createDtoPipe } from '../common/dto-pipe';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { DistributionTaskService } from './distribution-task.service';
import { CreateTaskService } from './application/create-task.service';
import { PublishTaskService } from './application/publish-task.service';
import { CancelTaskService } from './application/cancel-task.service';
import { BatchCreateTasksDto, CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { PublishTaskDto } from './dto/publish-task.dto';
import { FailTaskDto } from './dto/fail-task.dto';
import { CancelTaskDto, ReassignTaskDto, ScheduleTaskDto } from './dto/task-action.dto';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { buildDataScope, isResourceInScope, resolveScopedQuery } from '../user-access/data-scope';
import {
  assertPackageInScope,
  assertPackagesInScope,
  assertUnrestrictedAnalytics
} from '../user-access/scope-guards';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { isHttpUrl, normalizeHttpUrl } from '../common/http-url';
import { safePathId } from '../common/path-id';
import { resolveInteractiveDateSpan } from '../common/list-date-span';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('distribution-tasks')
@RequireLogin()
// Dual path: canonical /api/distribution-tasks + web client alias /api/tasks
@Controller(['api/distribution-tasks', 'api/tasks'])
export class DistributionTaskController {
  constructor(
    @Inject(DistributionTaskService) private readonly svc: DistributionTaskService,
    @Inject(CreateTaskService) private readonly createSvc: CreateTaskService,
    @Inject(PublishTaskService) private readonly publishSvc: PublishTaskService,
    @Inject(CancelTaskService) private readonly cancelSvc: CancelTaskService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get()
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'List distribution tasks',
    description: 'Paginated list with status/campaign/group/assignee/date filters'
  })
  list(@Query(createDtoPipe(TaskQueryDto)) query: TaskQueryDto, @Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) {
      // Residual #272: still project INTERACTIVE window so SPA honesty works empty-scope.
      const span = resolveInteractiveDateSpan(query.dateFrom, query.dateTo);
      return {
        items: [],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        dateFrom: span.dateFrom,
        dateTo: span.dateTo
      };
    }
    const scope = buildDataScope(actor ?? {});
    return this.svc.list(query, {
      unrestricted: scope.unrestricted,
      areaIds: scope.areaIds,
      merchantIds: scope.merchantIds
    });
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:write')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post()
  @ApiOperation({ summary: 'Create distribution task' })
  async create(@Body(createDtoPipe(CreateTaskDto)) body: CreateTaskDto, @Req() req: Request) {
    await assertPackageInScope(this.prisma, body.packageId, req);
    if (body.fallbackPackageId) {
      await assertPackageInScope(this.prisma, body.fallbackPackageId, req);
    }
    return this.createSvc.create(body);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:write')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('batch')
  @ApiOperation({ summary: 'Batch create distribution tasks' })
  async batchCreate(
    @Body(createDtoPipe(BatchCreateTasksDto)) body: BatchCreateTasksDto,
    @Req() req: Request
  ) {
    const items = body.campaignId
      ? body.tasks.map((t) => ({ ...t, campaignId: t.campaignId ?? body.campaignId }))
      : body.tasks;
    // One IN scope check for all primary + fallback package ids (≤200).
    const packageIds: string[] = [];
    for (const item of items) {
      if (item.packageId) packageIds.push(item.packageId);
      if (item.fallbackPackageId) packageIds.push(item.fallbackPackageId);
    }
    await assertPackagesInScope(this.prisma, packageIds, req);
    return this.createSvc.batchCreate(items);
  }

  @Get(['kpi', 'kpis'])
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Task KPI counts',
    description:
      'Aggregated counts: todayPending, inProgress, completed, overdue, failed, todayTaskGmv'
  })
  getKpi(@Req() req: Request) {
    // Platform-wide task KPIs + GMV — scoped roles use filtered list endpoints.
    assertUnrestrictedAnalytics(req);
    return this.svc.getKpi();
  }

  @Get(':id')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get task detail with executions' })
  async getById(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const detail = await this.svc.getById(safeId);
    // Residual #167: packageGeo folded into detail SELECT — no ContentPackage re-SELECT.
    await this.assertTaskAccess(detail.packageId, req, detail.packageGeo);
    // Live tracking codes enable unauthenticated public visit spam — only hand
    // them to roles that publish/execute (admin / platform_operator).
    // packageGeo is controller-only scope metadata — never leak to SPA body.
    const {
      trackingCode,
      packageGeo: _geo,
      ...rest
    } = detail as typeof detail & {
      trackingCode?: string;
      packageGeo?: unknown;
    };
    const actor = req.user as AuthUser | undefined;
    const roles = actor?.roles ?? [];
    if (!roles.includes('admin') && !roles.includes('platform_operator')) {
      return rest;
    }
    return { ...rest, trackingCode };
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:write')
  @Throttle({ long: { limit: 40, ttl: 60000 } })
  @Patch(':id')
  @Put(':id')
  @ApiOperation({ summary: 'Update distribution task' })
  async update(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateTaskDto)) body: UpdateTaskDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #156/#160: freeze/FK + package geo doubles as scope probe.
    const meta = await this.svc.getTaskUpdateMeta(safeId);
    await this.assertTaskAccess(meta.packageId, req, meta.packageGeo);
    if (body.packageId && body.packageId !== meta.packageId) {
      await assertPackageInScope(this.prisma, body.packageId, req);
    }
    if (body.fallbackPackageId) {
      await assertPackageInScope(this.prisma, body.fallbackPackageId, req);
    }
    return this.svc.update(safeId, body, meta);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:write')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Delete(':id')
  @ApiOperation({ summary: 'Delete distribution task' })
  async delete(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    // Residual #159/#160: delete meta + package geo doubles as scope probe.
    const meta = await this.svc.getTaskDeleteMeta(safeId);
    await this.assertTaskAccess(meta.packageId, req, meta.packageGeo);
    return this.svc.delete(safeId, meta);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:manage')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/schedule')
  @ApiOperation({
    summary: 'Schedule task',
    description:
      'Promote draft/waiting_audit/blocked → scheduled (requires plannedAt + approved content)'
  })
  async schedule(
    @Param('id') id: string,
    @Body(createDtoPipe(ScheduleTaskDto)) body: ScheduleTaskDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #156/#167: full row for schedule re-check + package geo scope fold.
    const task = await this.svc.getTaskRow(safeId);
    await this.assertTaskAccess(task.packageId, req, task.packageGeo);
    return this.cancelSvc.schedule(safeId, body.plannedAt, task);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:manage')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/complete')
  @ApiOperation({
    summary: 'Complete task',
    description: 'Mark published task as completed (attribution window ended)'
  })
  async complete(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    // Residual #151/#160: packageId+status+geo probe (scope + transition gate).
    const access = await this.svc.getTaskAccessMeta(safeId);
    await this.assertTaskAccess(access.packageId, req, access.packageGeo);
    return this.cancelSvc.complete(safeId, access.status);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:publish')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/publish')
  @ApiOperation({
    summary: 'Publish task',
    description: 'Confirm publish, creates DistributionExecution record'
  })
  async publish(
    @Param('id') id: string,
    @Body(createDtoPipe(PublishTaskDto)) body: PublishTaskDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #156/#167: full row for publish integrity + package geo scope fold.
    const task = await this.svc.getTaskRow(safeId);
    await this.assertTaskAccess(task.packageId, req, task.packageGeo);
    this.assertEvidenceUrl(body.evidenceUrl);
    const actor = req.user as AuthUser | undefined;
    return this.publishSvc.publish(
      safeId,
      {
        ...body,
        evidenceUrl: normalizeHttpUrl(body.evidenceUrl),
        operatorId: actor?.userId,
        operatorName: actor?.username ?? actor?.userId
      },
      task
    );
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:manage')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/fail')
  @ApiOperation({
    summary: 'Report task failure',
    description: 'Creates DistributionExecution with failure info'
  })
  async fail(
    @Param('id') id: string,
    @Body(createDtoPipe(FailTaskDto)) body: FailTaskDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #151/#160: packageId+status+geo probe (scope + transition gate).
    const access = await this.svc.getTaskAccessMeta(safeId);
    await this.assertTaskAccess(access.packageId, req, access.packageGeo);
    this.assertEvidenceUrl(body.evidenceUrl);
    const actor = req.user as AuthUser | undefined;
    return this.publishSvc.fail(
      safeId,
      {
        ...body,
        evidenceUrl: normalizeHttpUrl(body.evidenceUrl),
        operatorId: actor?.userId,
        operatorName: actor?.username ?? actor?.userId
      },
      access.status
    );
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:manage')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel task', description: 'Cancel with optional reason' })
  async cancel(
    @Param('id') id: string,
    @Body(createDtoPipe(CancelTaskDto)) body: CancelTaskDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #151/#160: packageId+status+geo probe (scope + transition gate).
    const access = await this.svc.getTaskAccessMeta(safeId);
    await this.assertTaskAccess(access.packageId, req, access.packageGeo);
    return this.cancelSvc.cancel(safeId, body?.reason, access.status);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:manage')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/reassign')
  @ApiOperation({ summary: 'Reassign task', description: 'Change assignee' })
  async reassign(
    @Param('id') id: string,
    @Body(createDtoPipe(ReassignTaskDto)) body: ReassignTaskDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #151/#160: packageId+status+geo probe (scope + terminal gate).
    const access = await this.svc.getTaskAccessMeta(safeId);
    await this.assertTaskAccess(access.packageId, req, access.packageGeo);
    return this.cancelSvc.reassign(safeId, body.assigneeId, body.assigneeName, access.status);
  }

  @Get(':id/performance')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Task performance data',
    description:
      'Aggregated performance metrics from TaskPerformanceDaily (TPD GMV capped at trailing 90d)'
  })
  async getPerformance(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    // Residual #108/#160: access meta includes package geo for scoped operators.
    const access = await this.svc.getTaskAccessMeta(safeId);
    await this.assertTaskAccess(access.packageId, req, access.packageGeo);
    return this.svc.getPerformance(safeId);
  }

  private assertEvidenceUrl(value?: string): void {
    if (value != null && String(value).trim() !== '' && !isHttpUrl(value)) {
      throw new BadRequestException('evidenceUrl 必须是 http(s) 绝对链接');
    }
  }

  /**
   * Residual #160: when packageGeo is preloaded from a task+package JOIN, skip the
   * ContentPackage re-SELECT. `packageGeo === null` means dangling package FK.
   * Omit packageGeo (undefined) for paths that only know packageId (detail/row).
   */
  private async assertTaskAccess(
    packageId: string,
    req: Request,
    packageGeo?: { areaId: string | null; merchantId: string | null } | null
  ): Promise<void> {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) throw new ForbiddenException('无权访问该任务');
    const scope = buildDataScope(actor ?? {});
    if (scope.unrestricted) return;
    let geo = packageGeo;
    if (geo === undefined) {
      const pkg = await this.prisma.contentPackage.findUnique({
        where: { packageId },
        select: { areaId: true, merchantId: true }
      });
      if (!pkg) throw new NotFoundException('任务关联套餐不存在');
      geo = { areaId: pkg.areaId, merchantId: pkg.merchantId };
    } else if (geo === null) {
      throw new NotFoundException('任务关联套餐不存在');
    }
    if (!isResourceInScope(actor ?? {}, { areaId: geo.areaId, merchantId: geo.merchantId })) {
      throw new ForbiddenException('无权访问该任务');
    }
  }
}
