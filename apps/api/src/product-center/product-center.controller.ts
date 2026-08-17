import {
  Body,
  Controller,
  Get,
  Inject,
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
import { createDtoPipe } from '../common/dto-pipe';
import { safePathId } from '../common/path-id';
import { assertPackageInScope } from '../user-access/scope-guards';
import { resolveScopedQuery } from '../user-access/data-scope';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ProductCenterListQueryDto } from './product-center.dto';
import { ProductChangeReviewDto, ProductEditRequestDto } from './product-center.dto';
import { ProductCenterService } from './product-center.service';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('product-center')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
@Controller('api/product-center')
export class ProductCenterController {
  constructor(
    @Inject(ProductCenterService) private readonly service: ProductCenterService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get('products')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '商品与库存列表', description: '商品分页、库存状态和库存摘要' })
  list(
    @Query(createDtoPipe(ProductCenterListQueryDto)) query: ProductCenterListQueryDto,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) {
      return {
        items: [],
        pagination: { page: query.page, pageSize: query.pageSize, total: 0, hasMore: false },
        summary: {
          totalSkus: 0,
          activeSkus: 0,
          lowStockSkus: 0,
          outOfStockSkus: 0,
          stockTotal: 0,
          stockLeft: 0
        },
        dataSources: ['ContentPackage', 'SalesSnapshot']
      };
    }
    return this.service.listProducts(query, {
      areaId: scoped.areaId,
      areaIds: scoped.areaIds,
      merchantId: scoped.merchantId,
      merchantIds: scoped.merchantIds
    });
  }

  @Get('products/:packageId')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '商品与库存详情', description: '商品档案与库存快照时间线' })
  async detail(@Param('packageId') packageId: string, @Req() req: Request) {
    const id = safePathId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    return this.service.getProduct(id);
  }

  @Post('products/:packageId/edit-requests')
  @RequirePermissions('packages:write')
  @RequireIdempotency('product-edit')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '提交商品编辑申请',
    description: '商品字段变更先进入审核链，不直接覆盖线上商品'
  })
  async requestEdit(
    @Param('packageId') packageId: string,
    @Body(createDtoPipe(ProductEditRequestDto)) body: ProductEditRequestDto,
    @Req() req: Request
  ) {
    const id = safePathId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    return this.service.requestEdit(id, body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  @Post('product-change-requests/:requestId/approve')
  @RequirePermissions('packages:write')
  @RequireIdempotency('product-edit')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '审核通过商品编辑申请' })
  async approveEdit(
    @Param('requestId') requestId: string,
    @Body(createDtoPipe(ProductChangeReviewDto)) body: ProductChangeReviewDto,
    @Req() req: Request
  ) {
    const id = safePathId(requestId);
    await this.assertChangeRequestScope(id, req);
    return this.service.approveEdit(id, body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  @Post('product-change-requests/:requestId/reject')
  @RequirePermissions('packages:write')
  @RequireIdempotency('product-edit')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '驳回商品编辑申请' })
  async rejectEdit(
    @Param('requestId') requestId: string,
    @Body(createDtoPipe(ProductChangeReviewDto)) body: ProductChangeReviewDto,
    @Req() req: Request
  ) {
    const id = safePathId(requestId);
    await this.assertChangeRequestScope(id, req);
    return this.service.rejectEdit(id, body, {
      userId: (req.user as AuthUser | undefined)?.userId
    });
  }

  private async assertChangeRequestScope(requestId: string, req: Request): Promise<void> {
    const request = await this.prisma.productChangeRequest.findUnique({
      where: { id: requestId },
      select: { packageId: true }
    });
    if (!request) {
      await assertPackageInScope(this.prisma, '', req);
      return;
    }
    await assertPackageInScope(this.prisma, request.packageId, req);
  }
}
