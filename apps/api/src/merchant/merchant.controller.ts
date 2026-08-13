import { createDtoPipe } from '../common/dto-pipe';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { MerchantService } from './merchant.service';
import {
  CreateMerchantApplicationDto,
  MerchantApplicationQueryDto,
  MerchantApplicationReviewDto,
  MerchantForceQueryDto,
  MerchantTrendQueryDto,
  MerchantsListQueryDto
} from './merchant.dto';
import { safePathId } from '../common/path-id';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { isResourceInScope, resolveScopedQuery } from '../user-access/data-scope';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import { hasForceSignal } from '../common/force-signal';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('merchants')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
@Controller('api/merchants')
export class MerchantController {
  constructor(
    @Inject(MerchantService) private readonly service: MerchantService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  // Full aggregate (packages + sales chunks) is cached but still expensive on miss.
  // Tighter long limit — heavy gate already bounds process concurrency.
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Get()
  @RequirePermissions('merchant:read')
  @ApiOperation({ summary: '商家列表' })
  list(
    @Query(createDtoPipe(MerchantsListQueryDto)) query: MerchantsListQueryDto,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, { areaId: query.areaId });
    if (scoped.emptyScope) {
      return {
        items: [],
        pagination: { page: query.page, pageSize: query.pageSize, hasMore: false, total: 0 }
      };
    }
    // Merchant operators only see their bound merchant(s) via post-filter in service.
    return this.service.listMerchants(
      { ...query, areaId: scoped.areaId ?? query.areaId },
      {
        merchantIds: scoped.merchantIds ?? (scoped.merchantId ? [scoped.merchantId] : undefined),
        areaIds: scoped.areaIds
      },
      hasForceSignal(req, query)
    );
  }

  @Get('applications')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '商家入驻申请列表' })
  listApplications(
    @Query(createDtoPipe(MerchantApplicationQueryDto)) query: MerchantApplicationQueryDto,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, { areaId: query.areaId });
    if (scoped.emptyScope) {
      return {
        items: [],
        pagination: { page: query.page, pageSize: query.pageSize, total: 0, hasMore: false }
      };
    }
    return this.service.listApplications(query, {
      areaIds: scoped.areaIds ?? (scoped.areaId ? [scoped.areaId] : undefined),
      merchantIds: scoped.merchantIds ?? (scoped.merchantId ? [scoped.merchantId] : undefined)
    });
  }

  @Get('applications/:applicationId')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '商家入驻申请详情' })
  async getApplication(@Param('applicationId') applicationId: string, @Req() req: Request) {
    const id = safePathId(applicationId);
    const application = await this.service.getApplication(id);
    this.assertApplicationAccess(application, req);
    return application;
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @RequireIdempotency('merchant-application')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('applications')
  @ApiOperation({ summary: '创建商家入驻申请' })
  createApplication(
    @Body(createDtoPipe(CreateMerchantApplicationDto)) body: CreateMerchantApplicationDto,
    @Req() req: Request
  ) {
    return this.service.createApplication(body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @RequireIdempotency('merchant-approval')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('applications/:applicationId/qualification-approve')
  @ApiOperation({ summary: '通过商家资质审核' })
  approveQualification(
    @Param('applicationId') applicationId: string,
    @Body(createDtoPipe(MerchantApplicationReviewDto)) body: MerchantApplicationReviewDto,
    @Req() req: Request
  ) {
    return this.transitionApplication(applicationId, 'qualification_approve', body, req);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @RequireIdempotency('merchant-approval')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('applications/:applicationId/contract-approve')
  @ApiOperation({ summary: '通过商家合同审核' })
  approveContract(
    @Param('applicationId') applicationId: string,
    @Body(createDtoPipe(MerchantApplicationReviewDto)) body: MerchantApplicationReviewDto,
    @Req() req: Request
  ) {
    return this.transitionApplication(applicationId, 'contract_approve', body, req);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @RequireIdempotency('merchant-approval')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('applications/:applicationId/enable')
  @ApiOperation({ summary: '启用已完成审核的商家' })
  enableApplication(
    @Param('applicationId') applicationId: string,
    @Body(createDtoPipe(MerchantApplicationReviewDto)) body: MerchantApplicationReviewDto,
    @Req() req: Request
  ) {
    return this.transitionApplication(applicationId, 'enable', body, req);
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @RequireIdempotency('merchant-approval')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('applications/:applicationId/reject')
  @ApiOperation({ summary: '驳回商家入驻申请' })
  rejectApplication(
    @Param('applicationId') applicationId: string,
    @Body(createDtoPipe(MerchantApplicationReviewDto)) body: MerchantApplicationReviewDto,
    @Req() req: Request
  ) {
    return this.transitionApplication(applicationId, 'reject', body, req);
  }

  // Static paths before :merchantId/* so they are not captured as ids
  // Multi-query catalog scan (packages + coords + GMV) — throttle concurrent fans.
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Get('heatmap')
  @RequirePermissions('merchant:read')
  @ApiOperation({ summary: '商家热力图数据（按区域聚合 + 坐标 + GMV）' })
  heatmap(@Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) {
      return {
        points: [],
        totalMerchants: 0,
        mappedMerchants: 0,
        unmappedMerchants: 0,
        center: { lat: 22.543, lng: 114.058 }
      };
    }
    return this.service.getHeatmap({
      areaIds: scoped.areaIds ?? (scoped.areaId ? [scoped.areaId] : undefined),
      merchantIds: scoped.merchantIds ?? (scoped.merchantId ? [scoped.merchantId] : undefined)
    });
  }

  @Post('refresh-addresses')
  @Roles('admin', 'platform_operator')
  @RequirePermissions('merchant:manage')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @ApiOperation({ summary: '从 ContentPackage 抽取商家地址刷新 Merchant 表' })
  refreshAddresses() {
    return this.service.refreshAddresses();
  }

  @Get(':merchantId/profile')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '商家画像' })
  async profile(
    @Param('merchantId') merchantId: string,
    @Query(createDtoPipe(MerchantForceQueryDto)) query: MerchantForceQueryDto,
    @Req() req: Request
  ) {
    const id = safePathId(merchantId);
    await this.assertMerchantAccess(id, req);
    return this.service.getProfile(id, hasForceSignal(req, query));
  }

  @Get(':merchantId/trend')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '商家 30/60/90 日 GMV/退款/核销趋势' })
  async trend(
    @Param('merchantId') merchantId: string,
    @Query(createDtoPipe(MerchantTrendQueryDto)) query: MerchantTrendQueryDto,
    @Req() req: Request
  ) {
    const id = safePathId(merchantId);
    await this.assertMerchantAccess(id, req);
    return this.service.getTrend(id, query);
  }

  @Get(':merchantId/skus')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '商家 SKU 列表（含 stale flag）' })
  async skus(
    @Param('merchantId') merchantId: string,
    @Query(createDtoPipe(MerchantTrendQueryDto)) query: MerchantTrendQueryDto,
    @Req() req: Request
  ) {
    const id = safePathId(merchantId);
    await this.assertMerchantAccess(id, req);
    return this.service.listSkus(id, query, hasForceSignal(req, query));
  }

  @Get(':merchantId/competitors')
  @RequirePermissions('merchant:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '同区域/品类竞品' })
  async competitors(@Param('merchantId') merchantId: string, @Req() req: Request) {
    const id = safePathId(merchantId);
    await this.assertMerchantAccess(id, req);
    return this.service.listCompetitors(id);
  }

  private async assertMerchantAccess(merchantId: string, req: Request): Promise<void> {
    const id = safePathId(merchantId);
    if (!id) throw new NotFoundException('商家不存在');
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, { merchantId: id });
    if (scoped.emptyScope) {
      throw new ForbiddenException('无权访问该商家');
    }
    // unrestricted → ok
    if (
      !scoped.areaId &&
      !scoped.merchantId &&
      !scoped.areaIds?.length &&
      !scoped.merchantIds?.length
    ) {
      return;
    }
    // merchant-bound: direct id check
    if (scoped.merchantId || scoped.merchantIds?.length) {
      const allowed =
        (scoped.merchantId && scoped.merchantId === id) ||
        Boolean(scoped.merchantIds?.includes(id));
      if (!allowed) throw new ForbiddenException('无权访问该商家');
      return;
    }
    // area-bound: authorize via EXISTS any package in scoped areas (not LIMIT 1 sample —
    // multi-area merchants would false-deny or false-allow on arbitrary first row).
    const allowedAreas =
      scoped.areaIds && scoped.areaIds.length
        ? scoped.areaIds
        : scoped.areaId
          ? [scoped.areaId]
          : [];
    if (!allowedAreas.length) {
      throw new ForbiddenException('无权访问该商家');
    }
    const placeholders = allowedAreas.map(() => '?').join(',');
    const inScope = await this.prisma.$queryRawUnsafe<Array<{ ok: number }>>(
      `SELECT 1 as ok FROM "ContentPackage"
       WHERE "merchantId" = ? AND "areaId" IN (${placeholders})
       LIMIT 1`,
      id,
      ...allowedAreas
    );
    if (inScope.length) return;

    // Distinguish missing merchant vs out-of-scope for clearer client errors.
    const anyPkg = await this.prisma.$queryRawUnsafe<Array<{ ok: number }>>(
      `SELECT 1 as ok FROM "ContentPackage" WHERE "merchantId" = ? LIMIT 1`,
      id
    );
    if (!anyPkg.length) {
      // Also check Merchant table when packages are empty.
      const merchant = await this.prisma.$queryRawUnsafe<Array<{ merchantId: string }>>(
        `SELECT "merchantId" FROM "Merchant" WHERE "merchantId" = ? LIMIT 1`,
        id
      );
      if (!merchant.length) throw new NotFoundException(`商家不存在: ${id}`);
    }
    throw new ForbiddenException('无权访问该商家');
  }

  private async transitionApplication(
    applicationId: string,
    action: 'qualification_approve' | 'contract_approve' | 'enable' | 'reject',
    body: MerchantApplicationReviewDto,
    req: Request
  ) {
    const id = safePathId(applicationId);
    const application = await this.service.getApplication(id);
    this.assertApplicationAccess(application, req);
    return this.service.transitionApplication(id, action, body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  private assertApplicationAccess(
    application: { areaId: string | null; merchantId: string | null },
    req: Request
  ): void {
    const actor = req.user as AuthUser | undefined;
    if (!isResourceInScope(actor ?? {}, application)) {
      throw new ForbiddenException('无权访问该入驻申请');
    }
  }
}
