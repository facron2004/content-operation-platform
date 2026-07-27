import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CopyService } from './copy.service';
import { GenerateCopyDto, AuditCopyDto, ListCopiesQueryDto } from './content.dto';
import { ForbiddenException } from '@nestjs/common';
import { Roles } from '../user-access/role.decorator';
import { buildDataScope, isResourceInScope, resolveScopedQuery } from '../user-access/data-scope';
import { assertPackageInScope } from '../user-access/scope-guards';
import { PrismaService } from '../prisma/prisma.service';
import { safePathId } from '../common/path-id';
import { createDtoPipe } from '../common/dto-pipe';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('copy')
@Controller('api/content')
export class CopyController {
  constructor(
    @Inject(CopyService) private readonly copyService: CopyService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Post('generate')
  @ApiOperation({
    summary: '生成文稿',
    description: 'AI 或规则兜底生成营销文稿，支持微信群/朋友圈/商家转发渠道'
  })
  async generateCopies(
    @Body(createDtoPipe(GenerateCopyDto)) body: GenerateCopyDto,
    @Req() req: Request
  ) {
    await assertPackageInScope(this.prisma, body.packageId, req);
    const actor = req.user as AuthUser | undefined;
    return this.copyService.generateCopies({
      packageId: body.packageId,
      channel: body.channel,
      scenario: body.scenario ?? '',
      tone: body.tone ?? '',
      copyCount: Number(body.copyCount ?? 1),
      extraInstruction: body.extraInstruction,
      useAI: body.useAI,
      // Attribute to JWT actor only; never accept free-form body.createdBy.
      createdBy: actor?.username ?? actor?.userId
    });
  }

  @Get('copies')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  listCopies(
    @Query(createDtoPipe(ListCopiesQueryDto)) query: ListCopiesQueryDto,
    @Req() req?: Request
  ) {
    const actor = req?.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) {
      return {
        items: [],
        pagination: {
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
          total: 0,
          totalPages: 1
        }
      };
    }
    const scope = buildDataScope(actor ?? {});
    return this.copyService.listCopies(
      {
        auditStatus: query.auditStatus,
        channel: query.channel,
        areaIds: scope.unrestricted ? undefined : scope.areaIds,
        merchantIds: scope.unrestricted ? undefined : scope.merchantIds
      },
      query.page,
      query.pageSize
    );
  }

  @Get('copies/:contentId')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '文案详情（含 body/cta）' })
  async getCopy(@Param('contentId') contentId: string, @Req() req: Request) {
    const id = safePathId(contentId);
    // Residual #104: single getCopy round-trip — GeneratedCopy already carries packageId
    // for scope assert (was getCopyPackageId + getCopy double hit).
    // Residual #161: denormalized areaId/merchantId scopes without ContentPackage re-SELECT.
    const copy = await this.copyService.getCopy(id);
    this.assertCopyInScope(copy, req);
    return copy;
  }

  @Roles('admin', 'platform_operator', 'auditor')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Post('copies/:contentId/audit')
  async auditCopy(
    @Param('contentId') contentId: string,
    @Body(createDtoPipe(AuditCopyDto)) body: AuditCopyDto,
    @Req() req: Request
  ) {
    const id = safePathId(contentId);
    // Residual #114: single getCopy for scope + audit (was getCopyPackageId + service re-find).
    // Residual #161: denormalized areaId/merchantId scopes without ContentPackage re-SELECT.
    const copy = await this.copyService.getCopy(id);
    this.assertCopyInScope(copy, req);
    const actor = req.user as AuthUser | undefined;
    // Auditor may approve/reject copy text, but minting DistributionTask is operator lifecycle.
    const roles = actor?.roles ?? [];
    const mintDistributionTask = roles.includes('admin') || roles.includes('platform_operator');
    return this.copyService.auditCopy(id, { ...body, mintDistributionTask }, copy);
  }

  /**
   * Residual #161: GeneratedCopy freezes areaId/merchantId at create time (same fields
   * ContentPackage would provide). Scope against the denormalized geo and skip the
   * package re-SELECT that assertPackageInScope would pay. generate still uses
   * assertPackageInScope (request only has packageId).
   */
  private assertCopyInScope(
    copy: { areaId?: string | null; merchantId?: string | null },
    req: Request
  ): void {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) throw new ForbiddenException('无权访问该文案');
    if (!isResourceInScope(actor ?? {}, { areaId: copy.areaId, merchantId: copy.merchantId })) {
      throw new ForbiddenException('无权访问该文案');
    }
  }
}
