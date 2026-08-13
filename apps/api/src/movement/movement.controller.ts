import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { safePathId } from '../common/path-id';
import { resolveScopedQuery } from '../user-access/data-scope';
import { assertPackageInScope, assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { MovementService } from './movement.service';
import {
  MovementMovingQueryDto,
  MovementSkusQueryDto,
  MovementTimelineQueryDto,
  MovementTodayQueryDto
} from './movement.dto';
import { buildStagnantCsv } from './movement-csv';
import { createDtoPipe } from '../common/dto-pipe';
import { clampListPage, clampListPageSize, CSV_EXPORT_MAX_ROWS } from '../common/sql-chunk';
import { hasForceSignal } from '../common';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

function applyMovementScope<
  T extends { areaId?: string; merchantId?: string; areaIds?: string[]; merchantIds?: string[] }
>(query: T, req: Request): (T & { areaIds?: string[]; merchantIds?: string[] }) | null {
  const actor = req.user as AuthUser | undefined;
  const scoped = resolveScopedQuery(actor ?? {}, {
    areaId: query.areaId,
    merchantId: query.merchantId
  });
  if (scoped.emptyScope) return null;
  return {
    ...query,
    areaId: scoped.areaId ?? query.areaId,
    merchantId: scoped.merchantId ?? query.merchantId,
    ...(scoped.areaIds?.length && !scoped.areaId ? { areaIds: scoped.areaIds } : {}),
    ...(scoped.merchantIds?.length && !scoped.merchantId ? { merchantIds: scoped.merchantIds } : {})
  };
}

function emptyPage(page = 1, pageSize = 20) {
  return { items: [], pagination: { page, pageSize, total: 0, hasMore: false } };
}

function listMovingFromQuery(
  service: MovementService,
  query: {
    days?: 1 | 7 | 30;
    page?: number;
    pageSize?: number;
    merchantId?: string;
    merchantIds?: string[];
    category?: string;
    areaId?: string;
    areaIds?: string[];
    search?: string;
    force?: boolean;
  }
) {
  // Cap page/pageSize — defense-in-depth even when DTO Max is bypassed.
  const page = clampListPage(query.page, 100);
  const pageSize = clampListPageSize(query.pageSize);
  return service.listMoving(
    {
      days: query.days ?? 7,
      page,
      pageSize,
      merchantId: query.merchantId,
      merchantIds: query.merchantIds,
      category: query.category,
      areaId: query.areaId,
      areaIds: query.areaIds,
      search: query.search?.trim().slice(0, 100)
    },
    query.force
  );
}

async function exportStagnantCsv(service: MovementService, q: MovementSkusQueryDto, res: Response) {
  // Single-flight + CSV_EXPORT_MAX_ROWS cap live in listStagnantForExport.
  // Residual #262: surface truncation honesty via response headers (SPA toast).
  const all = await service.listStagnantForExport(q);
  const total = all.pagination?.total ?? all.items.length;
  const truncated = all.pagination?.hasMore === true || total > all.items.length;
  if (truncated) {
    res.setHeader('X-Export-Truncated', '1');
    res.setHeader('X-Export-Limit', String(CSV_EXPORT_MAX_ROWS));
    res.setHeader('X-Export-Total', String(total));
  }
  const csv = buildStagnantCsv(all.items);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="stagnant-skus.csv"');
  res.send(csv);
}

@ApiTags('movement')
@RequireLogin()
@Controller('api/movement')
export class MovementController {
  constructor(
    @Inject(MovementService) private readonly service: MovementService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get('today')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '今日动销概览' })
  today(
    @Query(createDtoPipe(MovementTodayQueryDto)) q: MovementTodayQueryDto,
    @Req() req: Request
  ) {
    // Platform-wide movement KPIs — scoped roles use list endpoints with area/merchant filters.
    assertUnrestrictedAnalytics(req);
    return this.service.getToday(q.date, hasForceSignal(req, q));
  }

  // Cold multi-scan aggregate (heavy gate + TTL) — tighter than interactive 30/min.
  @Get('skus/moving')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '动销 SKU 列表 (1/7/30 天窗口)' })
  moving(
    @Query(createDtoPipe(MovementMovingQueryDto)) q: MovementMovingQueryDto,
    @Req() req: Request
  ) {
    const scoped = applyMovementScope(q, req);
    if (!scoped) {
      return emptyPage(q.page ?? 1, q.pageSize ?? 20);
    }
    return listMovingFromQuery(this.service, {
      days: q.days,
      page: q.page,
      pageSize: q.pageSize,
      merchantId: scoped.merchantId,
      merchantIds: scoped.merchantIds,
      category: q.category,
      areaId: scoped.areaId,
      areaIds: scoped.areaIds,
      search: q.search,
      force: hasForceSignal(req, q)
    });
  }

  // Cold multi-scan aggregate (heavy gate + TTL) — tighter than interactive 30/min.
  @Get('skus/stagnant')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '滞销 SKU 列表' })
  stagnant(
    @Query(createDtoPipe(MovementSkusQueryDto)) q: MovementSkusQueryDto,
    @Req() req: Request
  ) {
    const scoped = applyMovementScope(q, req);
    if (!scoped) return emptyPage(q.page ?? 1, q.pageSize ?? 20);
    return this.service.listStagnant(scoped, hasForceSignal(req, q));
  }

  @Get('skus/stagnant/export')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '滞销 SKU 导出 CSV' })
  exportStagnant(
    @Query(createDtoPipe(MovementSkusQueryDto)) q: MovementSkusQueryDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const scoped = applyMovementScope(q, req);
    if (!scoped) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="stagnant-skus.csv"');
      res.send('');
      return;
    }
    return exportStagnantCsv(this.service, scoped, res);
  }

  @Get('skus/:packageId/timeline')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '单 SKU 动销时间线 (30/60/90 天)' })
  async timeline(
    @Param('packageId') id: string,
    @Query(createDtoPipe(MovementTimelineQueryDto)) q: MovementTimelineQueryDto,
    @Req() req: Request
  ) {
    const packageId = safePathId(id);
    await assertPackageInScope(this.prisma, packageId, req);
    return this.service.getTimeline(packageId, q.days);
  }
}
