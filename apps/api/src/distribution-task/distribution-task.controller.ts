import { createDtoPipe } from '../common/dto-pipe';
import { Controller, Get, Inject, Param, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { DistributionTaskService } from './distribution-task.service';
import { CreateTaskService } from './application/create-task.service';
import { PublishTaskService } from './application/publish-task.service';
import { CancelTaskService } from './application/cancel-task.service';
import { TaskQueryDto } from './dto/task-query.dto';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { buildDataScope, resolveScopedQuery } from '../user-access/data-scope';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { safePathId } from '../common/path-id';
import { resolveInteractiveDateSpan } from '../common/list-date-span';
import { assertTaskAccess, type AuthUser } from './distribution-task-controller-helpers';

@ApiTags('distribution-tasks')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
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
  @RequirePermissions('tasks:read')
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

  @Get(['kpi', 'kpis'])
  @RequirePermissions('tasks:read')
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
  @RequirePermissions('tasks:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get task detail with executions' })
  async getById(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const detail = await this.svc.getById(safeId);
    // Residual #167: packageGeo folded into detail SELECT — no ContentPackage re-SELECT.
    await assertTaskAccess(this.prisma, detail.packageId, req, detail.packageGeo);
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

  @Get(':id/performance')
  @RequirePermissions('tasks:read')
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
    await assertTaskAccess(this.prisma, access.packageId, req, access.packageGeo);
    return this.svc.getPerformance(safeId);
  }
}
