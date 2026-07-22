import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MerchantService } from './merchant.service';
import { MerchantTrendQueryDto, MerchantsListQueryDto } from './merchant.dto';
import { Roles } from '../user-access/role.decorator';

@ApiTags('merchants')
@Controller('api/merchants')
export class MerchantController {
  constructor(@Inject(MerchantService) private readonly service: MerchantService) {}

  @Get()
  @ApiOperation({ summary: '商家列表' })
  list(@Query() query: MerchantsListQueryDto) {
    return this.service.listMerchants(query);
  }

  // Static paths before :merchantId/* so they are not captured as ids
  @Get('heatmap')
  @ApiOperation({ summary: '商家热力图数据（按区域聚合 + 坐标 + GMV）' })
  heatmap() {
    return this.service.getHeatmap();
  }

  @Post('refresh-addresses')
  @Roles('admin', 'platform_operator')
  @ApiOperation({ summary: '从 ContentPackage 抽取商家地址刷新 Merchant 表' })
  refreshAddresses() {
    return this.service.refreshAddresses();
  }

  @Get(':merchantId/profile')
  @ApiOperation({ summary: '商家画像' })
  profile(@Param('merchantId') merchantId: string) {
    return this.service.getProfile(merchantId);
  }

  @Get(':merchantId/trend')
  @ApiOperation({ summary: '商家 30/60/90 日 GMV/退款/核销趋势' })
  trend(@Param('merchantId') merchantId: string, @Query() query: MerchantTrendQueryDto) {
    return this.service.getTrend(merchantId, query);
  }

  @Get(':merchantId/skus')
  @ApiOperation({ summary: '商家 SKU 列表（含 stale flag）' })
  skus(@Param('merchantId') merchantId: string, @Query() query: MerchantTrendQueryDto) {
    return this.service.listSkus(merchantId, query);
  }

  @Get(':merchantId/competitors')
  @ApiOperation({ summary: '同区域/品类竞品' })
  competitors(@Param('merchantId') merchantId: string) {
    return this.service.listCompetitors(merchantId);
  }
}
