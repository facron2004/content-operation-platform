import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { RecommendPackageItem, UserRole } from '@content/shared';
import { ContentService } from './content.service';
import { PackageDetailService } from './package-detail.service';
import { PackageDetailQueryDto, AICopyConfigDto } from './content.dto';

@ApiTags('packages')
@Controller('api/content')
export class PackageController {
  constructor(
    @Inject(ContentService) private readonly contentService: ContentService,
    @Inject(PackageDetailService) private readonly packageDetailService: PackageDetailService,
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
    const min = inventoryMin !== undefined && inventoryMin !== '' ? Number(inventoryMin) : undefined;
    const max = inventoryMax !== undefined && inventoryMax !== '' ? Number(inventoryMax) : undefined;
    const result = this.contentService.getRecommendations({
      date,
      areaId: areaIdSnake ?? areaIdCamel,
      merchantId: merchantIdSnake ?? merchantIdCamel,
      role, status, category,
      inventoryMin: Number.isFinite(min) ? min : undefined,
      inventoryMax: Number.isFinite(max) ? max : undefined,
      inventoryFlag
    });
    if (page !== undefined || pageSize !== undefined) {
      return result.then(({ date: resultDate, areaId, packages }: { date: string; areaId: string; packages: RecommendPackageItem[] }) => {
        const total = packages.length;
        const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 50));
        const safePage = Math.min(Math.ceil(total / safePageSize) || 1, Math.max(1, Number(page) || 1));
        const offset = (safePage - 1) * safePageSize;
        return {
          date: resultDate, areaId,
          packages: packages.slice(offset, offset + safePageSize),
          pagination: { page: safePage, pageSize: safePageSize, total, totalPages: Math.ceil(total / safePageSize) || 1 }
        };
      });
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
    return { packageId, scoreBreakdown: analysis.scoreBreakdown, operationTags: analysis.operationTags, operationAlerts: analysis.operationAlerts };
  }

  @Get('packages/:packageId/tags')
  async getPackageTags(@Param('packageId') packageId: string) {
    const analysis = await this.contentService.getPackageAnalysis(packageId);
    return { packageId, items: analysis.operationTags ?? [] };
  }

  @Get('packages/:packageId/detail')
  async getPackageDetail(@Param('packageId') packageId: string, @Query() query: PackageDetailQueryDto) {
    const detail = await this.packageDetailService.fetchPackageDetail(packageId, { forceRefresh: query.forceRefresh ?? false, saveRawHtml: query.saveRawHtml ?? false });
    if (!detail) return { success: false, message: 'Failed to fetch package detail' };
    return { success: true, data: detail };
  }

  @Post('packages/:packageId/detail/refresh')
  async refreshPackageDetail(@Param('packageId') packageId: string) {
    const detail = await this.packageDetailService.fetchPackageDetail(packageId, { forceRefresh: true });
    if (!detail) return { success: false, message: 'Failed to refresh package detail' };
    return { success: true, data: detail, message: 'Package detail refreshed successfully' };
  }

  @Get('packages/cache/stats')
  getPackageCacheStats() { return this.packageDetailService.getDetailedStats(); }

  @Post('packages/cache/clear')
  clearPackageCache(@Query('packageId') packageId?: string) {
    this.packageDetailService.clearCache(packageId);
    return { success: true, message: packageId ? 'Cache cleared for package ' + packageId : 'All package cache cleared' };
  }

  @Get('ai-copy/status')
  getAICopyStatus() { return this.contentService.getAICopyStatus(); }

  @Post('ai-copy/config')
  updateAICopyConfig(@Body() body: AICopyConfigDto) { return this.contentService.updateAICopyConfig(body); }

  @Post('inventory/daily-crawl')
  crawlDailyInventory(@Query('date') date?: string) { return this.contentService.crawlDailyInventory(date); }

  @Get('communities')
  getCommunities(@Query('role') role?: UserRole) { return this.contentService.getCommunities(role); }

  @Get('communities/:groupId')
  getCommunityRecommendations(@Param('groupId') groupId: string, @Query('role') role?: UserRole) {
    return this.contentService.getCommunityRecommendations(groupId, role);
  }

  @Post('battle-cards/generate')
  generateBattleCard(@Body() body: { packageId: string }) { return this.contentService.generateBattleCard(body.packageId); }

  @Get('battle-cards/:packageId')
  getBattleCard(@Param('packageId') packageId: string) { return this.contentService.generateBattleCard(packageId); }

  @Get('health')
  health() { return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), memory: process.memoryUsage() }; }
}