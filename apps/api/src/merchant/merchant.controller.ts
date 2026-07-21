import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth';
import { MerchantService } from './merchant.service';
import { MerchantTrendQueryDto, MerchantsListQueryDto } from './merchant.dto';

@ApiTags('merchants')
@Controller('api/merchants')
export class MerchantController {
  constructor(@Inject(MerchantService) private readonly service: MerchantService) {}

  @Get()
  @ApiOperation({ summary: '????' })
  list(@Query() query: MerchantsListQueryDto) {
    return this.service.listMerchants(query);
  }

  @Get(':merchantId/profile')
  @ApiOperation({ summary: '????' })
  profile(@Param('merchantId') merchantId: string) {
    return this.service.getProfile(merchantId);
  }

  @Get(':merchantId/trend')
  @ApiOperation({ summary: '?? 30/60/90 ? GMV/??/????' })
  trend(@Param('merchantId') merchantId: string, @Query() query: MerchantTrendQueryDto) {
    return this.service.getTrend(merchantId, query);
  }

  @Get(':merchantId/skus')
  @ApiOperation({ summary: '?? SKU ???? stale flag?' })
  skus(@Param('merchantId') merchantId: string, @Query() query: MerchantTrendQueryDto) {
    return this.service.listSkus(merchantId, query);
  }

  @Get(':merchantId/competitors')
  @ApiOperation({ summary: '? area ? category ??' })
  competitors(@Param('merchantId') merchantId: string) {
    return this.service.listCompetitors(merchantId);
  }

  @Public()
  @Get('heatmap')
  @ApiOperation({ summary: '商家热力图数据（按区域聚合 + 坐标 + GMV）' })
  heatmap() {
    return this.service.getHeatmap();
  }

  @Post('refresh-addresses')
  @ApiOperation({ summary: '从 ContentPackage 抽取商家地址刷新 Merchant 表' })
  refreshAddresses() {
    return this.service.refreshAddresses();
  }
}
