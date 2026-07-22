import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { RecommendPackageItem, UserRole } from '@content/shared';
import { paginate } from '@content/shared';
import { ContentService } from './content.service';
import { PackageDetailService } from './package-detail';
import { AutoLoginService } from './auto-login.service';
import {
  PackageDetailQueryDto,
  AICopyConfigDto,
  BattleCardGenerateDto,
  UpdateCookieDto,
  RecommendationsQueryDto
} from './content.dto';
import { Public } from '../auth';
import { Roles } from '../user-access/role.decorator';
import { nowISO } from '../common/format';
import { PrismaService } from '../prisma/prisma.service';
import { geocodeMerchantsFromPartnerShop } from '../merchant/merchant-geocoder';

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
  @ApiOperation({ summary: '套餐推荐列表' })
  getRecommendations(@Query() query: RecommendationsQueryDto) {
    const result = this.contentService.getRecommendations({
      date: query.date,
      areaId: query.area_id ?? query.areaId,
      merchantId: query.merchant_id ?? query.merchantId,
      role: query.role,
      status: query.status,
      category: query.category,
      inventoryMin: query.inventoryMin,
      inventoryMax: query.inventoryMax,
      inventoryFlag: query.inventoryFlag
    });
    if (query.page !== undefined || query.pageSize !== undefined) {
      return result.then(
        ({
          date: resultDate,
          areaId,
          packages
        }: {
          date: string;
          areaId: string;
          packages: RecommendPackageItem[];
        }) => {
          // 推荐接口在 controller 层做二次切片:service 返回全量,controller 按 page/pageSize 切片
          const paged = paginate(packages, Number(query.page) || 1, Number(query.pageSize) || 50);
          // paginate 会再次 clamp page 到合法范围;还原 totalPages 的"非零即 1"语义
          return {
            date: resultDate,
            areaId,
            packages: paged.items,
            pagination: {
              ...paged.pagination,
              page: Math.min(paged.pagination.totalPages, paged.pagination.page),
              totalPages: paged.pagination.total === 0 ? 1 : paged.pagination.totalPages
            }
          };
        }
      );
    }
    return result;
  }

  @Get('packages/categories')
  async getCategories(@Query('areaId') areaId?: string, @Query('role') role?: UserRole) {
    return this.contentService.getCategories({ areaId, role });
  }

  @Get('packages/:packageId/analysis')
  getPackageAnalysis(@Param('packageId') packageId: string) {
    return this.contentService.getPackageAnalysis(packageId);
  }

  @Get('packages/:packageId/score')
  async getPackageScore(@Param('packageId') packageId: string) {
    const analysis = await this.contentService.getPackageAnalysis(packageId);
    return {
      packageId,
      scoreBreakdown: analysis.scoreBreakdown,
      operationTags: analysis.operationTags,
      operationAlerts: analysis.operationAlerts
    };
  }

  @Get('packages/:packageId/tags')
  async getPackageTags(@Param('packageId') packageId: string) {
    const analysis = await this.contentService.getPackageAnalysis(packageId);
    return { packageId, items: analysis.operationTags ?? [] };
  }

  @Get('packages/:packageId/detail')
  async getPackageDetail(
    @Param('packageId') packageId: string,
    @Query() query: PackageDetailQueryDto
  ) {
    const detail = await this.packageDetailService.fetchPackageDetail(packageId, {
      forceRefresh: query.forceRefresh ?? false,
      saveRawHtml: query.saveRawHtml ?? false
    });
    if (!detail) return { success: false, message: 'Failed to fetch package detail' };
    return { success: true, data: detail };
  }

  @Roles('admin', 'platform_operator')
  @Post('packages/:packageId/detail/refresh')
  async refreshPackageDetail(@Param('packageId') packageId: string) {
    const detail = await this.packageDetailService.fetchPackageDetail(packageId, {
      forceRefresh: true
    });
    if (!detail) return { success: false, message: 'Failed to refresh package detail' };
    return { success: true, data: detail, message: 'Package detail refreshed successfully' };
  }

  @Get('packages/cache/stats')
  getPackageCacheStats() {
    return this.packageDetailService.getDetailedStats();
  }

  @Roles('admin', 'platform_operator')
  @Post('packages/cache/clear')
  clearPackageCache(@Query('packageId') packageId?: string) {
    this.packageDetailService.clearCache(packageId);
    return {
      success: true,
      message: packageId ? `Cache cleared for package ${packageId}` : 'All package cache cleared'
    };
  }

  @Get('cookie/status')
  @ApiOperation({ summary: '获取 JeeSite Cookie 状态' })
  getCookieStatus() {
    return this.autoLoginService.getCookieStatus();
  }

  @Roles('admin')
  @Post('cookie/update')
  @ApiOperation({ summary: '更新 JeeSite Cookie' })
  updateCookie(@Body() body: UpdateCookieDto) {
    return this.autoLoginService.updateManualCookie(body.cookie);
  }

  @Get('ai-copy/status')
  getAICopyStatus() {
    return this.contentService.getAICopyStatus();
  }

  @Roles('admin')
  @Post('ai-copy/config')
  updateAICopyConfig(@Body() body: AICopyConfigDto) {
    return this.contentService.updateAICopyConfig(body);
  }

  @Roles('admin', 'platform_operator')
  @Post('inventory/daily-crawl')
  crawlDailyInventory(@Query('date') date?: string) {
    return this.contentService.crawlDailyInventory(date);
  }

  @Roles('admin')
  @Post('sync-merchants')
  @ApiOperation({ summary: '从 JeeSite 拉取套餐数据并同步商家地址到 Merchant 表' })
  syncMerchants() {
    return this.contentService.syncMerchantsFromJeeSite();
  }

  @Roles('admin')
  @Post('geocode-merchants')
  @ApiOperation({ summary: '从 JeeSite 合作商店铺表抓取 longitude/latitude 回填 Merchant 表' })
  geocodeMerchants() {
    return geocodeMerchantsFromPartnerShop(this.prisma, this.configService, this.autoLoginService);
  }

  @Roles('admin')
  @Post('geocode-from-partner-shop')
  @ApiOperation({ summary: '从 JeeSite 合作商店铺表抓取 longitude/latitude（别名）' })
  geocodeFromPartnerShop() {
    return geocodeMerchantsFromPartnerShop(this.prisma, this.configService, this.autoLoginService);
  }

  @Roles('admin')
  @Get('debug-raw/:packageId')
  @ApiOperation({ summary: '调试：返回套餐表单页的完整 HTML，检查坐标字段' })
  async debugRaw(@Param('packageId') packageId: string) {
    return this.packageDetailService.debugRawHtml(packageId);
  }

  @Roles('admin')
  @Get('debug-partner-shop/:merchantId')
  @ApiOperation({ summary: '调试：抓取合作商店铺表单页，检查坐标字段' })
  async debugPartnerShop(@Param('merchantId') merchantId: string) {
    return this.packageDetailService.debugPartnerShopHtml(merchantId);
  }

  @Get('communities')
  getCommunities(@Query('role') role?: UserRole) {
    return this.contentService.getCommunities(role);
  }

  @Get('communities/:groupId')
  getCommunityRecommendations(@Param('groupId') groupId: string, @Query('role') role?: UserRole) {
    return this.contentService.getCommunityRecommendations(groupId, role);
  }

  @Roles('admin', 'platform_operator')
  @Post('battle-cards/generate')
  generateBattleCard(@Body() body: BattleCardGenerateDto) {
    return this.contentService.generateBattleCard(body.packageId);
  }

  @Get('battle-cards/:packageId')
  getBattleCard(@Param('packageId') packageId: string) {
    return this.contentService.generateBattleCard(packageId);
  }

  @Public()
  @Get('health')
  health() {
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: nowISO(),
      // Sanitized memory: only expose total heap size, not detailed breakdown
      memory: {
        heapUsedMB: toMB(mem.heapUsed),
        heapTotalMB: toMB(mem.heapTotal)
      },
      nodeVersion: process.version
    };
  }
}
