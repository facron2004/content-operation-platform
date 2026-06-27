import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { RecommendPackageItem, UserRole } from '@content/shared';
import { paginate } from '@content/shared';
import { ContentService } from './content.service';
import { PackageDetailService } from './package-detail.service';
import { AutoLoginService } from './auto-login.service';
import { PackageDetailQueryDto, AICopyConfigDto, BattleCardGenerateDto, UpdateCookieDto } from './content.dto';
import { Public } from '../auth';

@ApiTags('packages')
@Controller('api/content')
export class PackageController {
  constructor(
    @Inject(ContentService) private readonly contentService: ContentService,
    @Inject(PackageDetailService) private readonly packageDetailService: PackageDetailService,
    @Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService
  ) {}

  @Get('packages/recommend')
  @ApiOperation({ summary: '套餐推荐列表' })
  getRecommendations(
    @Query('date') date?: string,
    @Query('area_id') areaIdSnake?: string,
    @Query('areaId') areaIdCamel?: string,
    @Query('merchant_id') merchantIdSnake?: string,
    @Query('merchantId') merchantIdCamel?: string,
    @Query('role') role?: UserRole,
    @Query('status') status?: 'selling',
    @Query('category') category?: string,
    @Query('inventoryMin') inventoryMin?: string,
    @Query('inventoryMax') inventoryMax?: string,
    @Query('inventoryFlag') inventoryFlag?: 'unsold',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    const min =
      inventoryMin !== undefined && inventoryMin !== '' ? Number(inventoryMin) : undefined;
    const max =
      inventoryMax !== undefined && inventoryMax !== '' ? Number(inventoryMax) : undefined;
    const result = this.contentService.getRecommendations({
      date,
      areaId: areaIdSnake ?? areaIdCamel,
      merchantId: merchantIdSnake ?? merchantIdCamel,
      role,
      status,
      category,
      inventoryMin: Number.isFinite(min) ? min : undefined,
      inventoryMax: Number.isFinite(max) ? max : undefined,
      inventoryFlag
    });
    if (page !== undefined || pageSize !== undefined) {
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
          const paged = paginate(packages, Number(page) || 1, Number(pageSize) || 50);
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

  @Post('packages/cache/clear')
  clearPackageCache(@Query('packageId') packageId?: string) {
    this.packageDetailService.clearCache(packageId);
    return {
      success: true,
      message: packageId ? 'Cache cleared for package ' + packageId : 'All package cache cleared'
    };
  }

  @Get('cookie/status')
  @ApiOperation({ summary: '获取 JeeSite Cookie 状态' })
  getCookieStatus() {
    return this.autoLoginService.getCookieStatus();
  }

  @Post('cookie/update')
  @ApiOperation({ summary: '更新 JeeSite Cookie' })
  updateCookie(@Body() body: UpdateCookieDto) {
    return this.autoLoginService.updateManualCookie(body.cookie);
  }

  @Get('ai-copy/status')
  getAICopyStatus() {
    return this.contentService.getAICopyStatus();
  }

  @Post('ai-copy/config')
  updateAICopyConfig(@Body() body: AICopyConfigDto) {
    return this.contentService.updateAICopyConfig(body);
  }

  @Post('inventory/daily-crawl')
  crawlDailyInventory(@Query('date') date?: string) {
    return this.contentService.crawlDailyInventory(date);
  }

  @Get('communities')
  getCommunities(@Query('role') role?: UserRole) {
    return this.contentService.getCommunities(role);
  }

  @Get('communities/:groupId')
  getCommunityRecommendations(@Param('groupId') groupId: string, @Query('role') role?: UserRole) {
    return this.contentService.getCommunityRecommendations(groupId, role);
  }

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
      timestamp: new Date().toISOString(),
      // Sanitized memory: only expose total heap size, not detailed breakdown
      memory: {
        heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100
      },
      nodeVersion: process.version
    };
  }
}
