import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { OperationAlert, OperationAlertType } from '@content/shared';
import { AlertService } from './alert.service';
import { ContentService } from './content.service';
import { AlertResolveDto, AlertResolveBatchDto, AlertQueryDto } from './content.dto';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { resolveScopedQuery } from '../user-access/data-scope';
import { assertPackageInScope, assertPackagesInScope } from '../user-access/scope-guards';
import { PrismaService } from '../prisma/prisma.service';
import { createDtoPipe } from '../common/dto-pipe';
import { hasForceSignal } from '../common/force-signal';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('alerts')
@RequireLogin()
@Controller('api/content')
export class AlertController {
  constructor(
    @Inject(AlertService) private readonly alertService: AlertService,
    // ContentService 用于包"获取推荐数据"回调,传给 AlertService(避免 alert 依赖 content)
    @Inject(ContentService) private readonly contentService: ContentService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  // Cold path still fans into recommend (heavy-gated); keep long limit tight.
  @Get('alerts')
  @RequirePermissions('content:read')
  @Throttle({ long: { limit: 15, ttl: 60000 } })
  getOperationAlerts(
    @Query(createDtoPipe(AlertQueryDto)) query: AlertQueryDto,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) {
      return {
        items: [],
        summary: {
          totalCount: 0,
          activeCount: 0,
          resolvedCount: 0,
          dangerCount: 0,
          warningCount: 0,
          infoCount: 0,
          packageCount: 0,
          typeDistribution: {}
        },
        topPackages: [],
        // Residual #283: empty-scope still projects focus-package head honesty.
        focusPackageLimit: 0,
        focusPackageMatched: 0,
        focusPackageTruncated: false,
        pagination: {
          page: Number(query.page) || 1,
          pageSize: Number(query.pageSize) || 20,
          total: 0,
          totalPages: 1
        },
        // Residual #274: empty-scope still projects resolution-cap honesty fields.
        resolvedIdsLimit: 0,
        resolvedIdsLoaded: 0,
        resolvedIdsTruncated: false,
        // Residual #275: empty-scope still projects recommend source-cap honesty.
        sourceMatchedCount: 0,
        sourceLimit: 0,
        sourceTruncated: false
      };
    }
    const scope = {
      areaId: scoped.areaId,
      merchantId: scoped.merchantId,
      areaIds: scoped.areaIds,
      merchantIds: scoped.merchantIds
    };
    const force = hasForceSignal(req, query);
    return this.alertService.getOperationAlerts(
      {
        role: query.role,
        date: query.date,
        level: query.level as OperationAlert['level'] | undefined,
        type: query.type as OperationAlertType | undefined,
        keyword: query.keyword,
        page: query.page,
        pageSize: query.pageSize
      },
      (q) =>
        this.contentService.getRecommendations(
          {
            ...q,
            // Prefer alert query date so inventory window matches the as-of day
            // operators are inspecting (not always "today").
            date: query.date ?? q.date,
            areaId: scope.areaId ?? q.areaId,
            merchantId: scope.merchantId ?? q.merchantId,
            areaIds: scope.areaIds,
            merchantIds: scope.merchantIds
          },
          force
        ),
      // Scope must be part of the alert aggregate key so multi-tenant operators
      // never share a ranked list (recommend callback already scopes packages).
      scope,
      force
    );
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('content:write')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post('alerts/:alertId/resolve')
  async resolveAlert(
    @Param('alertId') alertId: string,
    @Body(createDtoPipe(AlertResolveDto)) _body: AlertResolveDto,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    // Attribute to JWT actor only; never trust free-form body.resolvedBy.
    const resolvedBy = actor?.username ?? actor?.userId ?? 'operator';
    // Do not truncate at ':' — alertId is packageId:type; service validates shape.
    const id = String(alertId ?? '')
      .trim()
      .slice(0, 100);
    await this.assertAlertPackageInScope(id, req);
    return this.alertService.resolveOperationAlert(id, resolvedBy);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('content:write')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Post('alerts/resolve-batch')
  async resolveAlerts(
    @Body(createDtoPipe(AlertResolveBatchDto)) body: AlertResolveBatchDto,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const resolvedBy = actor?.username ?? actor?.userId ?? 'operator';
    const alertIds = (body.alertIds ?? []).map((id) =>
      String(id ?? '')
        .trim()
        .slice(0, 100)
    );
    // One IN lookup for all package sides (was N sequential assertPackageInScope).
    await this.assertAlertPackagesInScope(alertIds, req);
    return this.alertService.resolveOperationAlerts(alertIds, resolvedBy);
  }

  /** alertId is `packageId:type` — scope-check the package side before resolve. */
  private async assertAlertPackageInScope(alertId: string, req: Request): Promise<void> {
    // Match AlertService.normalizeAlertId: type is the segment after the last ':'.
    const sep = alertId.lastIndexOf(':');
    const packageId = sep > 0 ? alertId.slice(0, sep) : alertId;
    if (!packageId) return;
    await assertPackageInScope(this.prisma, packageId, req);
  }

  /** Batch variant of assertAlertPackageInScope — single ContentPackage IN query. */
  private async assertAlertPackagesInScope(alertIds: string[], req: Request): Promise<void> {
    const packageIds: string[] = [];
    for (const alertId of alertIds) {
      const sep = alertId.lastIndexOf(':');
      const packageId = sep > 0 ? alertId.slice(0, sep) : alertId;
      if (packageId) packageIds.push(packageId);
    }
    await assertPackagesInScope(this.prisma, packageIds, req);
  }
}
