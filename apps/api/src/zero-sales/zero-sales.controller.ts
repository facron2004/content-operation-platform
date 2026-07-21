/** Consolidated zero-sales module. */
import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { sendZeroSalesSkuCsv } from './zero-sales-csv';
import {
  ZeroSalesMerchantsQueryDto,
  ZeroSalesSkusQueryDto,
  ZeroSalesTimelineQueryDto
} from './zero-sales.dto';
import { ZeroSalesService } from './zero-sales.service';

@ApiTags('zero-sales')
@Controller('api/zero-sales')
export class ZeroSalesController {
  constructor(@Inject(ZeroSalesService) private readonly service: ZeroSalesService) {}

  @Get('merchants')
  @ApiOperation({ summary: '零动销商家清单' })
  listMerchants(@Query() query: ZeroSalesMerchantsQueryDto) {
    return this.service.listMerchants(query);
  }

  @Get('skus')
  @ApiOperation({ summary: '零动销 SKU 清单' })
  listSkus(@Query() query: ZeroSalesSkusQueryDto) {
    return this.service.listSkus(query);
  }

  @Get('skus/:packageId/timeline')
  @ApiOperation({ summary: '单 SKU 零动销时间线（30/60/90 天）' })
  timeline(@Param('packageId') packageId: string, @Query() query: ZeroSalesTimelineQueryDto) {
    return this.service.getSkuTimeline(packageId, query.days);
  }

  @Get('skus/export')
  @ApiOperation({ summary: '零动销 SKU 导出 CSV' })
  async exportSkus(@Query() query: ZeroSalesSkusQueryDto, @Res() res: Response) {
    sendZeroSalesSkuCsv(
      res,
      (await this.service.listSkus({ ...query, page: 1, pageSize: 5000 })).items
    );
  }
}
