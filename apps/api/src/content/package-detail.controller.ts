import { createDtoPipe } from '../common/dto-pipe';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ContentService } from './content.service';
import { ExternalDataCacheInvalidationService } from './external-data-cache-invalidation.service';
import { PackageDetailService } from './package-detail';
import { AutoLoginService } from './auto-login.service';
import { AICopyConfigDto, UpdateCookieDto } from './content.dto';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { assertPackageInScope } from '../user-access/scope-guards';
import { safePathId } from '../common/path-id';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('packages')
@RequireLogin()
@Controller('api/content')
export class PackageDetailController {
  constructor(
    @Inject(ContentService) private readonly contentService: ContentService,
    @Inject(ExternalDataCacheInvalidationService)
    private readonly externalDataCacheInvalidation: ExternalDataCacheInvalidationService,
    @Inject(PackageDetailService) private readonly packageDetailService: PackageDetailService,
    @Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get('packages/:packageId/detail')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  async getPackageDetail(@Param('packageId') packageId: string, @Req() req: Request) {
    const id = this.safePackageId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    // Authenticated reads always hit cache. Force external fetch only via
    // POST packages/:id/detail/refresh (RBAC-gated) — forceRefresh/saveRawHtml on
    // GET would let any logged-in user thrash Jeesite and dump raw HTML.
    const detail = await this.packageDetailService.fetchPackageDetail(id, {
      forceRefresh: false,
      saveRawHtml: false
    });
    if (!detail) return { success: false, message: 'Failed to fetch package detail' };
    return { success: true, data: detail };
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:refresh')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('packages/:packageId/detail/refresh')
  async refreshPackageDetail(@Param('packageId') packageId: string, @Req() req: Request) {
    const id = this.safePackageId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    const detail = await this.packageDetailService.fetchPackageDetail(id, {
      forceRefresh: true
    });
    if (!detail) return { success: false, message: 'Failed to refresh package detail' };
    return { success: true, data: detail, message: 'Package detail refreshed successfully' };
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('packages/cache/stats')
  getPackageCacheStats() {
    return this.packageDetailService.getDetailedStats();
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:refresh')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @Post('packages/cache/clear')
  clearPackageCache(@Query('packageId') packageId?: string) {
    // Cap free-form packageId so a multi-KB query string cannot poison logs/messages.
    const capped = safePathId(packageId);
    const safeId = capped || undefined;
    this.packageDetailService.clearCache(safeId);
    return {
      success: true,
      message: safeId ? `Cache cleared for package ${safeId}` : 'All package cache cleared'
    };
  }

  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('cookie/status')
  @ApiOperation({ summary: '获取 JeeSite Cookie 状态' })
  getCookieStatus() {
    // Status validates against EXTERNAL_API but AutoLoginService caches
    // the validation result so SPA 30s polling does not thrash JeeSite.
    return this.autoLoginService.getCookieStatus();
  }

  @Roles('admin')
  @RequirePermissions('packages:write')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('cookie/update')
  @ApiOperation({ summary: '更新 JeeSite Cookie' })
  async updateCookie(@Body(createDtoPipe(UpdateCookieDto)) body: UpdateCookieDto) {
    const result = await this.autoLoginService.updateManualCookie(body.cookie);
    if (result.success) {
      this.externalDataCacheInvalidation.invalidateExternalDataCaches();
    }
    return result;
  }

  /** AI provider config (masked key + baseURL) — not for every authenticated role. */
  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('ai-copy/status')
  getAICopyStatus() {
    return this.contentService.getAICopyStatus();
  }

  @Roles('admin')
  @RequirePermissions('packages:write')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('ai-copy/config')
  updateAICopyConfig(@Body(createDtoPipe(AICopyConfigDto)) body: AICopyConfigDto) {
    return this.contentService.updateAICopyConfig(body);
  }

  @Roles('admin')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Get('debug-raw/:packageId')
  @ApiOperation({ summary: '调试：返回套餐表单页的完整 HTML，检查坐标字段' })
  async debugRaw(@Param('packageId') packageId: string) {
    this.assertDebugEndpointsEnabled();
    return this.packageDetailService.debugRawHtml(this.safePackageId(packageId));
  }

  @Roles('admin')
  @RequirePermissions('packages:read')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Get('debug-partner-shop/:merchantId')
  @ApiOperation({ summary: '调试：抓取合作商店铺表单页，检查坐标字段' })
  async debugPartnerShop(@Param('merchantId') merchantId: string) {
    this.assertDebugEndpointsEnabled();
    return this.packageDetailService.debugPartnerShopHtml(safePathId(merchantId));
  }

  /** Cap free-form package path ids before DB/SSRF-adjacent fetch paths. */
  private safePackageId(packageId: string): string {
    return safePathId(packageId);
  }

  /** Debug HTML endpoints are disabled in production unless ENABLE_DEBUG_ENDPOINTS=true. */
  private assertDebugEndpointsEnabled(): void {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ENDPOINTS !== 'true') {
      throw new NotFoundException();
    }
  }
}
