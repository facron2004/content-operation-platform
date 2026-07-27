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
  Req
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { RecommendPackageItem, UserRole } from '@content/shared';
import { beijingDateKey, paginate, USER_ROLES } from '@content/shared';
import { ContentService } from './content.service';
import { PackageDetailService } from './package-detail';
import { AutoLoginService } from './auto-login.service';
import {
  AICopyConfigDto,
  BattleCardGenerateDto,
  UpdateCookieDto,
  RecommendationsQueryDto
} from './content.dto';
import { Public } from '../auth';
import { Roles } from '../user-access/role.decorator';
import { resolveScopedQuery } from '../user-access/data-scope';
import { assertPackageInScope } from '../user-access/scope-guards';
import { nowISO } from '../common/format';
import { safePathId } from '../common/path-id';
import { RECOMMEND_CACHE_CAP } from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import { geocodeMerchantsFromPartnerShop } from '../merchant/merchant-geocoder';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

/** 把字节数四舍五入到两位小数的 MB。 */
const toMB = (bytes: number): number => Math.round((bytes / (1024 * 1024)) * 100) / 100;

@ApiTags('packages')
@Controller('api/content')
export class PackageController {
  constructor(
    @Inject(ContentService) private readonly contentService: ContentService,
    @Inject(PackageDetailService) private readonly packageDetailService: PackageDetailService,
    @Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {}

  @Get('packages/recommend')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '套餐推荐列表' })
  getRecommendations(
    @Query(createDtoPipe(RecommendationsQueryDto)) query: RecommendationsQueryDto,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {
      areaId: query.area_id ?? query.areaId,
      merchantId: query.merchant_id ?? query.merchantId
    });
    if (scoped.emptyScope) {
      return {
        date: query.date ?? beijingDateKey(new Date()),
        areaId: 'none',
        packages: [] as RecommendPackageItem[],
        pagination: {
          page: Number(query.page) || 1,
          pageSize: Number(query.pageSize) || 50,
          total: 0,
          totalPages: 1
        },
        // Residual #267: RECOMMEND_CACHE_CAP honesty (empty scope is never truncated).
        matchedCount: 0,
        limit: RECOMMEND_CACHE_CAP,
        truncated: false
      };
    }
    const result = this.contentService.getRecommendations({
      date: query.date,
      areaId: scoped.areaId,
      merchantId: scoped.merchantId,
      areaIds: scoped.areaIds,
      merchantIds: scoped.merchantIds,
      role: query.role,
      status: query.status,
      category: query.category,
      inventoryMin: query.inventoryMin,
      inventoryMax: query.inventoryMax,
      inventoryFlag: query.inventoryFlag
    });
    // Always page at the controller — unbounded recommend payloads are a DoS vector
    // for unrestricted roles (full catalog). Default pageSize=50, max 200 via DTO.
    // Residual #267: forward matchedCount + limit/truncated so SPA can warn when the
    // ranked head is RECOMMEND_CACHE_CAP-clipped (pagination.total is head size only).
    return result.then(
      ({
        date: resultDate,
        areaId,
        packages,
        matchedCount
      }: {
        date: string;
        areaId: string;
        packages: RecommendPackageItem[];
        matchedCount?: number;
      }) => {
        const paged = paginate(packages, Number(query.page) || 1, Number(query.pageSize) || 50);
        const limit = RECOMMEND_CACHE_CAP;
        const safeMatched =
          typeof matchedCount === 'number' && Number.isFinite(matchedCount)
            ? Math.max(0, Math.floor(matchedCount))
            : packages.length;
        const truncated = packages.length >= limit || safeMatched > packages.length;
        return {
          date: resultDate,
          areaId,
          packages: paged.items,
          pagination: {
            ...paged.pagination,
            page: Math.min(paged.pagination.totalPages, paged.pagination.page),
            totalPages: paged.pagination.total === 0 ? 1 : paged.pagination.totalPages
          },
          matchedCount: safeMatched,
          limit,
          truncated
        };
      }
    );
  }

  @Get('packages/categories')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  async getCategories(
    @Query('areaId') areaId: string | undefined,
    @Query('role') role: UserRole | undefined,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const safeAreaId = typeof areaId === 'string' ? areaId.trim().slice(0, 100) : undefined;
    const safeRole = role && (USER_ROLES as readonly string[]).includes(role) ? role : undefined;
    const scoped = resolveScopedQuery(actor ?? {}, { areaId: safeAreaId });
    if (scoped.emptyScope) return { categories: [] as string[] };
    // Prefer multi-id scope so multi-area/merchant operators see full category set.
    return this.contentService.getCategories({
      areaId: scoped.areaId,
      areaIds: scoped.areaIds,
      merchantId: scoped.merchantId,
      merchantIds: scoped.merchantIds,
      role: safeRole
    });
  }

  @Get('packages/:packageId/analysis')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  async getPackageAnalysis(@Param('packageId') packageId: string, @Req() req: Request) {
    const id = this.safePackageId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    return this.contentService.getPackageAnalysis(id);
  }

  @Get('packages/:packageId/score')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  async getPackageScore(@Param('packageId') packageId: string, @Req() req: Request) {
    const id = this.safePackageId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    const analysis = await this.contentService.getPackageAnalysis(id);
    return {
      packageId: id,
      scoreBreakdown: analysis.scoreBreakdown,
      operationTags: analysis.operationTags,
      operationAlerts: analysis.operationAlerts
    };
  }

  @Get('packages/:packageId/tags')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  async getPackageTags(@Param('packageId') packageId: string, @Req() req: Request) {
    const id = this.safePackageId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    const analysis = await this.contentService.getPackageAnalysis(id);
    return { packageId: id, items: analysis.operationTags ?? [] };
  }

  @Get('packages/:packageId/detail')
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
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('packages/cache/stats')
  getPackageCacheStats() {
    return this.packageDetailService.getDetailedStats();
  }

  @Roles('admin', 'platform_operator')
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
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('cookie/status')
  @ApiOperation({ summary: '获取 JeeSite Cookie 状态' })
  getCookieStatus() {
    // Status validates against EXTERNAL_API but AutoLoginService caches
    // the validation result so SPA 30s polling does not thrash JeeSite.
    return this.autoLoginService.getCookieStatus();
  }

  @Roles('admin')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('cookie/update')
  @ApiOperation({ summary: '更新 JeeSite Cookie' })
  updateCookie(@Body(createDtoPipe(UpdateCookieDto)) body: UpdateCookieDto) {
    return this.autoLoginService.updateManualCookie(body.cookie);
  }

  /** AI provider config (masked key + baseURL) — not for every authenticated role. */
  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('ai-copy/status')
  getAICopyStatus() {
    return this.contentService.getAICopyStatus();
  }

  @Roles('admin')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('ai-copy/config')
  updateAICopyConfig(@Body(createDtoPipe(AICopyConfigDto)) body: AICopyConfigDto) {
    return this.contentService.updateAICopyConfig(body);
  }

  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('inventory/daily-crawl')
  crawlDailyInventory(@Query('date') date?: string) {
    // Only accept ISO dates — free-form strings must not reach crawler SQL.
    const safeDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
    return this.contentService.crawlDailyInventory(safeDate);
  }

  @Roles('admin')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('sync-merchants')
  @ApiOperation({ summary: '从 JeeSite 拉取套餐数据并同步商家地址到 Merchant 表' })
  syncMerchants() {
    return this.contentService.syncMerchantsFromJeeSite();
  }

  @Roles('admin')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('geocode-merchants')
  @ApiOperation({ summary: '从 JeeSite 合作商店铺表抓取 longitude/latitude 回填 Merchant 表' })
  geocodeMerchants() {
    return geocodeMerchantsFromPartnerShop(this.prisma, this.configService, this.autoLoginService);
  }

  @Roles('admin')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('geocode-from-partner-shop')
  @ApiOperation({ summary: '从 JeeSite 合作商店铺表抓取 longitude/latitude（别名）' })
  geocodeFromPartnerShop() {
    return geocodeMerchantsFromPartnerShop(this.prisma, this.configService, this.autoLoginService);
  }

  @Roles('admin')
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Get('debug-raw/:packageId')
  @ApiOperation({ summary: '调试：返回套餐表单页的完整 HTML，检查坐标字段' })
  async debugRaw(@Param('packageId') packageId: string) {
    this.assertDebugEndpointsEnabled();
    return this.packageDetailService.debugRawHtml(this.safePackageId(packageId));
  }

  @Roles('admin')
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

  // Derived communities rebuild from the selling catalog — throttle to bound CPU.
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('communities')
  getCommunities(@Query('role') role: UserRole | undefined, @Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) {
      // Residual #278/#281: empty-scope still projects dual-cap + group-cap honesty fields.
      return {
        items: [] as never[],
        sourceMatchedCount: 0,
        sourceLimit: 0,
        sourceTruncated: false,
        inputLimit: 0,
        inputLoaded: 0,
        inputTruncated: false,
        groupMatched: 0,
        groupLimit: 0,
        groupTruncated: false
      };
    }
    const safeRole = role && (USER_ROLES as readonly string[]).includes(role) ? role : undefined;
    // JWT scope drives area/merchant clamp; only allow known role enum values.
    return this.contentService.getCommunities(safeRole, {
      areaId: scoped.areaId,
      merchantId: scoped.merchantId,
      areaIds: scoped.areaIds,
      merchantIds: scoped.merchantIds
    });
  }

  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('communities/:groupId')
  getCommunityRecommendations(
    @Param('groupId') groupId: string,
    @Query('role') role: UserRole | undefined,
    @Req() req: Request
  ) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    if (scoped.emptyScope) throw new ForbiddenException('无权访问该社群');
    const safeRole = role && (USER_ROLES as readonly string[]).includes(role) ? role : undefined;
    const safeGroupId = safePathId(groupId);
    return this.contentService.getCommunityRecommendations(safeGroupId, safeRole, {
      areaId: scoped.areaId,
      merchantId: scoped.merchantId,
      areaIds: scoped.areaIds,
      merchantIds: scoped.merchantIds
    });
  }

  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('battle-cards/generate')
  async generateBattleCard(
    @Body(createDtoPipe(BattleCardGenerateDto)) body: BattleCardGenerateDto,
    @Req() req: Request
  ) {
    await assertPackageInScope(this.prisma, body.packageId, req);
    return this.contentService.generateBattleCard(body.packageId);
  }

  // Same cost as generate (loads recommendations + builds card). Keep Roles+throttle
  // so any authenticated in-scope user cannot burn dataset load as a free GET.
  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @Get('battle-cards/:packageId')
  async getBattleCard(@Param('packageId') packageId: string, @Req() req: Request) {
    const id = this.safePackageId(packageId);
    await assertPackageInScope(this.prisma, id, req);
    return this.contentService.generateBattleCard(id);
  }

  @Public()
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @Get('health')
  health() {
    // Production: liveness only. Uptime/heap/nodeVersion aid recon + capacity
    // fingerprinting and must stay off the unauthenticated surface.
    if (process.env.NODE_ENV === 'production') {
      return { status: 'ok', timestamp: nowISO() };
    }
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: nowISO(),
      memory: {
        heapUsedMB: toMB(mem.heapUsed),
        heapTotalMB: toMB(mem.heapTotal)
      },
      nodeVersion: process.version
    };
  }
}
