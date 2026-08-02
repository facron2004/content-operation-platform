import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CommunityService } from './community.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunityQueryDto } from './dto/community-query.dto';
import { CommunityTasksQueryDto } from './dto/community-tasks-query.dto';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { isResourceInScope, resolveScopedQuery } from '../user-access/data-scope';
import { safePathId } from '../common/path-id';
import { createDtoPipe } from '../common/dto-pipe';
import { normalizeCommunityImportList, parseCommunityImportPayload } from './community-import';
import { ImportCommunityRawDto } from './dto/import-community.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('communities')
// Dual path: canonical /api/communities + web client alias /api/community-library
@RequireLogin()
@Controller(['api/communities', 'api/community-library'])
export class CommunityController {
  constructor(@Inject(CommunityService) private readonly svc: CommunityService) {}

  @Get()
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'List community groups',
    description: 'Paginated list with area/status/type filters'
  })
  list(@Query(createDtoPipe(CommunityQueryDto)) query: CommunityQueryDto, @Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, { areaId: query.areaId });
    if (scoped.emptyScope) {
      return {
        items: [],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20
      };
    }
    // Communities are area-keyed. Merchant-only operators (no area binding) must
    // not receive the full library catalog — detail already 403s via area match.
    // Unrestricted actors keep unfiltered list; area-scoped get area filter.
    const hasAreaFilter = Boolean(scoped.areaId || scoped.areaIds?.length);
    const merchantOnly = !hasAreaFilter && Boolean(scoped.merchantId || scoped.merchantIds?.length);
    if (merchantOnly) {
      return {
        items: [],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20
      };
    }
    return this.svc.list({
      ...query,
      areaId: scoped.areaId ?? query.areaId,
      ...(scoped.areaIds?.length ? { areaIds: scoped.areaIds } : {})
    } as CommunityQueryDto & { areaIds?: string[] });
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('community:write')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post()
  @ApiOperation({ summary: 'Create community group' })
  create(@Body(createDtoPipe(CreateCommunityDto)) body: CreateCommunityDto, @Req() req: Request) {
    // Defense-in-depth: even unrestricted write roles must not plant rows outside future scoped writes.
    this.assertCommunityAccess({ areaId: body.areaId }, req);
    return this.svc.create(body);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('community:write')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('import')
  @ApiOperation({
    summary: 'Batch import community groups',
    description: 'Accept {source, rawData} (web) or CreateCommunityDto[] (API)'
  })
  import(@Body() body: unknown, @Req() req: Request) {
    // Dual shape: ValidationPipe cannot model array|object unions, so we
    // validate the web {source, rawData} shape explicitly and fall back to
    // the legacy array path with normalizeCommunityImportList (200-row cap).
    if (body && !Array.isArray(body) && typeof body === 'object' && 'rawData' in body) {
      const dto = plainToInstance(ImportCommunityRawDto, body);
      const errors = validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true
      });
      if (errors.length) {
        throw new BadRequestException('导入格式无效：需要 {source: csv|json, rawData}');
      }
      const rows = parseCommunityImportPayload(dto.source, dto.rawData);
      this.assertImportAreasInScope(rows, req);
      return this.svc.import(rows);
    }
    // Legacy / programmatic: JSON array of community objects
    if (Array.isArray(body)) {
      const rows = normalizeCommunityImportList(body);
      this.assertImportAreasInScope(rows, req);
      return this.svc.import(rows);
    }
    throw new BadRequestException('导入格式无效：需要 {source, rawData} 或社群数组');
  }

  @Get(':id')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get community group detail' })
  async getById(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const group = await this.svc.getById(safeId);
    this.assertCommunityAccess(group, req);
    return group;
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('community:write')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Patch(':id')
  @Put(':id')
  @ApiOperation({ summary: 'Update community group' })
  async update(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateCommunityDto)) body: UpdateCommunityDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    // Residual #112/#154: areaId-only for scope; pass through so service skips re-probe.
    const areaId = await this.svc.getCommunityAreaId(safeId);
    this.assertCommunityAccess({ areaId }, req);
    // Re-check target area when reassignment is attempted (defense-in-depth for scoped writers).
    if (body.areaId && body.areaId !== areaId) {
      this.assertCommunityAccess({ areaId: body.areaId }, req);
    }
    return this.svc.update(safeId, body, areaId);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('community:write')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Delete(':id')
  @ApiOperation({ summary: 'Delete community group' })
  async delete(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const areaId = await this.svc.getCommunityAreaId(safeId);
    this.assertCommunityAccess({ areaId }, req);
    return this.svc.delete(safeId);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('community:write')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/disable')
  @ApiOperation({ summary: 'Soft-disable community group', description: 'Sets isActive=false' })
  async disable(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const areaId = await this.svc.getCommunityAreaId(safeId);
    this.assertCommunityAccess({ areaId }, req);
    return this.svc.disable(safeId);
  }

  // Residual #199: re-enable after soft-disable (UpdateCommunityDto has no isActive).
  @Roles('admin', 'platform_operator')
  @RequirePermissions('community:write')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post(':id/enable')
  @ApiOperation({ summary: 'Re-enable community group', description: 'Sets isActive=true' })
  async enable(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const areaId = await this.svc.getCommunityAreaId(safeId);
    this.assertCommunityAccess({ areaId }, req);
    return this.svc.enable(safeId);
  }

  @Get(':id/performance')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Community performance',
    description: 'Aggregated task KPIs for this community (TPD GMV capped at trailing 90d)'
  })
  async getPerformance(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    // Residual #112: areaId-only for scope (aggregates by groupId).
    const areaId = await this.svc.getCommunityAreaId(safeId);
    this.assertCommunityAccess({ areaId }, req);
    return this.svc.getPerformance(safeId);
  }

  @Get(':id/tasks')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Community tasks',
    description: 'List distribution tasks assigned to this community'
  })
  async getTasks(
    @Param('id') id: string,
    @Req() req: Request,
    @Query(createDtoPipe(CommunityTasksQueryDto)) query: CommunityTasksQueryDto
  ) {
    const safeId = safePathId(id);
    const areaId = await this.svc.getCommunityAreaId(safeId);
    this.assertCommunityAccess({ areaId }, req);
    // DTO Max(200) + service clamp; free-form page/pageSize strings no longer reach Number().
    return this.svc.getTasks(safeId, query.page ?? 1, query.pageSize ?? 20);
  }

  private assertImportAreasInScope(rows: Array<{ areaId?: string | null }>, req: Request): void {
    for (const row of rows) {
      this.assertCommunityAccess({ areaId: row.areaId }, req);
    }
  }

  private assertCommunityAccess(group: { areaId?: string | null }, req: Request): void {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) throw new ForbiddenException('无权访问该社群');
    if (!isResourceInScope(actor ?? {}, { areaId: group.areaId })) {
      throw new ForbiddenException('无权访问该社群');
    }
  }
}
