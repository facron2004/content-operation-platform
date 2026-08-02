import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignQueryDto } from './dto/campaign-query.dto';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { buildDataScope, resolveScopedQuery } from '../user-access/data-scope';
import { safePathId } from '../common/path-id';
import { createDtoPipe } from '../common/dto-pipe';
import { resolveInteractiveDateSpan } from '../common/list-date-span';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('campaigns')
@RequireLogin()
@Controller('api/campaigns')
export class CampaignController {
  constructor(@Inject(CampaignService) private readonly svc: CampaignService) {}

  @Get()
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'List campaigns',
    description: 'Paginated list with status/date/keyword filters'
  })
  list(@Query(createDtoPipe(CampaignQueryDto)) query: CampaignQueryDto, @Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) {
      // Residual #276: empty-scope still projects effective startDate span when filtered.
      const span =
        query.startDateFrom || query.startDateTo
          ? resolveInteractiveDateSpan(query.startDateFrom, query.startDateTo)
          : undefined;
      return {
        items: [],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        ...(span ? { startDateFrom: span.dateFrom, startDateTo: span.dateTo } : {})
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
  @RequirePermissions('campaigns:write')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post()
  @ApiOperation({ summary: 'Create campaign' })
  create(@Body(createDtoPipe(CreateCampaignDto)) body: CreateCampaignDto, @Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    return this.svc.create({
      ...body,
      // Always stamp owner from JWT; never accept free-form body.ownerId.
      ownerId: actor?.userId
    });
  }

  @Get(':id')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get campaign detail' })
  async getById(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const campaign = await this.svc.getById(safeId);
    this.assertCampaignAccess(campaign, req);
    return campaign;
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Patch(':id')
  @ApiOperation({ summary: 'Update campaign' })
  async update(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateCampaignDto)) body: UpdateCampaignDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #158: scope + freeze dates in one probe; pass freeze meta into update.
    const scope = await this.svc.getCampaignScope(safeId);
    this.assertCampaignAccess(scope, req);
    return this.svc.update(safeId, body, {
      status: scope.status,
      startDate: scope.startDate,
      endDate: scope.endDate
    });
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:write')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete campaign',
    description: 'Fails if campaign has active distribution tasks'
  })
  async delete(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const scope = await this.svc.getCampaignScope(safeId);
    this.assertCampaignAccess(scope, req);
    return this.svc.delete(safeId);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:publish')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/start')
  @ApiOperation({
    summary: 'Start campaign',
    description: 'Transition status from draft to active'
  })
  async start(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    // Residual #155: scope includes status — pass through so transition skips re-probe.
    const scope = await this.svc.getCampaignScope(safeId);
    this.assertCampaignAccess(scope, req);
    return this.svc.transitionStatus(safeId, 'active', scope.status);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:publish')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/pause')
  @ApiOperation({
    summary: 'Pause campaign',
    description: 'Transition status from active to paused'
  })
  async pause(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const scope = await this.svc.getCampaignScope(safeId);
    this.assertCampaignAccess(scope, req);
    return this.svc.transitionStatus(safeId, 'paused', scope.status);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:publish')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/complete')
  @ApiOperation({
    summary: 'Complete campaign',
    description: 'Transition status from active to completed'
  })
  async complete(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const scope = await this.svc.getCampaignScope(safeId);
    this.assertCampaignAccess(scope, req);
    return this.svc.transitionStatus(safeId, 'completed', scope.status);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('campaigns:publish')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel campaign' })
  async cancel(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const scope = await this.svc.getCampaignScope(safeId);
    this.assertCampaignAccess(scope, req);
    return this.svc.transitionStatus(safeId, 'cancelled', scope.status);
  }

  @Get(':id/performance')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Campaign performance',
    description: 'Aggregated task KPIs for this campaign (TPD GMV capped at trailing 90d)'
  })
  async getPerformance(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    // Residual #113: scope arrays only (aggregates by campaignId).
    const scope = await this.svc.getCampaignScope(safeId);
    this.assertCampaignAccess(scope, req);
    return this.svc.getPerformance(safeId);
  }

  private assertCampaignAccess(
    campaign: { areaIds?: string[]; merchantIds?: string[] },
    req: Request
  ): void {
    const actor = req.user as AuthUser | undefined;
    const scope = buildDataScope(actor ?? {});
    if (scope.unrestricted) return;
    if (scope.areaIds.length === 0 && scope.merchantIds.length === 0) {
      throw new ForbiddenException('无权访问该活动');
    }
    const areas = campaign.areaIds ?? [];
    const merchants = campaign.merchantIds ?? [];
    // Platform-wide campaigns (no bindings) stay unrestricted-only.
    if (!areas.length && !merchants.length) {
      throw new ForbiddenException('无权访问该活动');
    }
    const areaHit = areas.some((a) => scope.areaIds.includes(a));
    const merchantHit = merchants.some((m) => scope.merchantIds.includes(m));
    if (!areaHit && !merchantHit) {
      throw new ForbiddenException('无权访问该活动');
    }
  }
}
