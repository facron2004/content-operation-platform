import { createDtoPipe } from '../common/dto-pipe';
import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { DistributionTaskService } from './distribution-task.service';
import { CreateTaskService } from './application/create-task.service';
import { PublishTaskService } from './application/publish-task.service';
import { CancelTaskService } from './application/cancel-task.service';
import { UpdateTaskService } from './application/update-task.service';
import { DeleteTaskService } from './application/delete-task.service';
import { BatchCreateTasksDto, CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PublishTaskDto } from './dto/publish-task.dto';
import { FailTaskDto } from './dto/fail-task.dto';
import { CancelTaskDto, ReassignTaskDto, ScheduleTaskDto } from './dto/task-action.dto';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { assertPackageInScope, assertPackagesInScope } from '../user-access/scope-guards';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import { normalizeHttpUrl } from '../common/http-url';
import { safePathId } from '../common/path-id';
import {
  assertEvidenceUrl,
  assertTaskAccess,
  type AuthUser
} from './distribution-task-controller-helpers';

@ApiTags('distribution-tasks')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
// Dual path: canonical /api/distribution-tasks + web client alias /api/tasks
@Controller(['api/distribution-tasks', 'api/tasks'])
export class DistributionTaskCommandController {
  constructor(
    @Inject(DistributionTaskService) private readonly svc: DistributionTaskService,
    @Inject(CreateTaskService) private readonly createSvc: CreateTaskService,
    @Inject(PublishTaskService) private readonly publishSvc: PublishTaskService,
    @Inject(CancelTaskService) private readonly cancelSvc: CancelTaskService,
    @Inject(UpdateTaskService) private readonly updateSvc: UpdateTaskService,
    @Inject(DeleteTaskService) private readonly deleteSvc: DeleteTaskService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:write')
  @RequireIdempotency('create-task')
  @UseGuards(IdempotencyGuard)
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
  @RequireIdempotency('batch-create-tasks')
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
    await assertTaskAccess(this.prisma, meta.packageId, req, meta.packageGeo);
    if (body.packageId && body.packageId !== meta.packageId) {
      await assertPackageInScope(this.prisma, body.packageId, req);
    }
    if (body.fallbackPackageId) {
      await assertPackageInScope(this.prisma, body.fallbackPackageId, req);
    }
    return this.updateSvc.update(safeId, body, meta);
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
    await assertTaskAccess(this.prisma, meta.packageId, req, meta.packageGeo);
    return this.deleteSvc.delete(safeId, meta);
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
    await assertTaskAccess(this.prisma, task.packageId, req, task.packageGeo);
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
    await assertTaskAccess(this.prisma, access.packageId, req, access.packageGeo);
    return this.cancelSvc.complete(safeId, access.status);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('tasks:publish')
  @RequireIdempotency('publish-task')
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
    await assertTaskAccess(this.prisma, task.packageId, req, task.packageGeo);
    assertEvidenceUrl(body.evidenceUrl);
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
    await assertTaskAccess(this.prisma, access.packageId, req, access.packageGeo);
    assertEvidenceUrl(body.evidenceUrl);
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
    await assertTaskAccess(this.prisma, access.packageId, req, access.packageGeo);
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
    await assertTaskAccess(this.prisma, access.packageId, req, access.packageGeo);
    return this.cancelSvc.reassign(safeId, body.assigneeId, body.assigneeName, access.status);
  }
}
