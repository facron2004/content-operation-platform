import { createDtoPipe } from '../common/dto-pipe';
/** Consolidated zero-sales module. */
import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { sendZeroSalesSkuCsv } from './zero-sales-csv';
import {
  ZeroSalesMerchantsQueryDto,
  ZeroSalesSkusQueryDto,
  ZeroSalesTimelineQueryDto
} from './zero-sales.dto';
import { ZeroSalesService } from './zero-sales.service';
import { CSV_EXPORT_MAX_ROWS } from '../common/sql-chunk';
import { safePathId } from '../common/path-id';
import { resolveScopedQuery } from '../user-access/data-scope';
import { assertPackageInScope } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

@ApiTags('zero-sales')
@RequireLogin()
@Controller('api/zero-sales')
export class ZeroSalesController {
  constructor(
    @Inject(ZeroSalesService) private readonly service: ZeroSalesService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  // Full zero-sales merchant aggregate is a multi-k scan + sales chunks (TTL cached).
  // Tighter long limit — heavy gate already bounds process concurrency.
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Get('merchants')
  @ApiOperation({ summary: '零动销商家清单' })
  listMerchants(
    @Query(createDtoPipe(ZeroSalesMerchantsQueryDto)) query: ZeroSalesMerchantsQueryDto,
    @Req() req: Request
  ) {
    const scopedQuery = this.applyScope(query, req);
    if (!scopedQuery) {
      return {
        items: [],
        pagination: { page: query.page, pageSize: query.pageSize, total: 0, hasMore: false }
      };
    }
    return this.service.listMerchants(scopedQuery);
  }

  // Filter-first SQL page but still cold-heavy under multi-filter keys.
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Get('skus')
  @ApiOperation({ summary: '零动销 SKU 清单' })
  listSkus(
    @Query(createDtoPipe(ZeroSalesSkusQueryDto)) query: ZeroSalesSkusQueryDto,
    @Req() req: Request
  ) {
    const scopedQuery = this.applyScope(query, req);
    if (!scopedQuery) {
      return {
        items: [],
        pagination: { page: query.page, pageSize: query.pageSize, total: 0, hasMore: false }
      };
    }
    return this.service.listSkus(scopedQuery);
  }

  @Get('skus/export')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '零动销 SKU 导出 CSV' })
  async exportSkus(
    @Query(createDtoPipe(ZeroSalesSkusQueryDto)) query: ZeroSalesSkusQueryDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const scopedQuery = this.applyScope(query, req);
    if (!scopedQuery) {
      sendZeroSalesSkuCsv(res, []);
      return;
    }
    // Cap export rows so a single request cannot materialize the entire catalog.
    // listSkusForExport single-flights concurrent exports (409 when busy).
    // Residual #262: surface truncation honesty via response headers (SPA toast).
    const page = await this.service.listSkusForExport({
      ...scopedQuery,
      page: 1,
      pageSize: CSV_EXPORT_MAX_ROWS
    });
    const total = page.pagination?.total ?? page.items.length;
    const truncated = page.pagination?.hasMore === true || total > page.items.length;
    if (truncated) {
      res.setHeader('X-Export-Truncated', '1');
      res.setHeader('X-Export-Limit', String(CSV_EXPORT_MAX_ROWS));
      res.setHeader('X-Export-Total', String(total));
    }
    sendZeroSalesSkuCsv(res, page.items);
  }

  @Get('skus/:packageId/timeline')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '单 SKU 零动销时间线（30/60/90 天）' })
  async timeline(
    @Param('packageId') packageId: string,
    @Query(createDtoPipe(ZeroSalesTimelineQueryDto)) query: ZeroSalesTimelineQueryDto,
    @Req() req: Request
  ) {
    const id = safePathId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    return this.service.getSkuTimeline(id, query.days);
  }

  private applyScope<
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
      ...(scoped.merchantIds?.length && !scoped.merchantId
        ? { merchantIds: scoped.merchantIds }
        : {})
    };
  }
}
