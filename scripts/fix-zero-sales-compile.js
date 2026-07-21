const fs = require('fs');
const path = require('path');

// Fix CSV BOM corruption
const csvPath = path.resolve('apps/api/src/zero-sales/zero-sales-csv.ts');
let csv = fs.readFileSync(csvPath, 'utf8');
csv = csv.replace(
  /res\.send\([^;]+;/,
  "res.send('\\uFEFF' + lines.join('\\n'));"
);
// ensure comment after
csv = csv.replace(
  /res\.send\('\\uFEFF' \+ lines\.join\('\\n'\)\);[^\n]*/,
  "res.send('\\uFEFF' + lines.join('\\n')); // BOM so Excel keeps Chinese readable"
);
fs.writeFileSync(csvPath, csv, 'utf8');
console.log('csv fixed');

// Rewrite controller with correct UTF-8 Chinese
const ctrl = `/** Consolidated zero-sales module. */
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
`;
fs.writeFileSync(path.resolve('apps/api/src/zero-sales/zero-sales.controller.ts'), ctrl, 'utf8');
console.log('controller fixed');

// Fix service comment + ensure type imports for DTOs used only as types can stay value (decorators not needed)
const svcPath = path.resolve('apps/api/src/zero-sales/zero-sales.service.ts');
let svc = fs.readFileSync(svcPath, 'utf8');
svc = svc.replace(
  /\/\*\*[^*]*\*\/\s*@Injectable\(\)/,
  '/** 中台数据层：零动销清单（商家 + SKU）。 */\n@Injectable()'
);
fs.writeFileSync(svcPath, svc, 'utf8');
console.log('service fixed');

// Fix dto merchant comment + skus sort comment
const dtoPath = path.resolve('apps/api/src/zero-sales/zero-sales.dto.ts');
let dto = fs.readFileSync(dtoPath, 'utf8');
dto = dto.replace(
  /\/\*\*[^*]*\*\/\s*export class ZeroSalesMerchantsQueryDto/,
  '/** 零动销商家清单分页+过滤。默认按 stale_30d 过滤。 */\nexport class ZeroSalesMerchantsQueryDto'
);
dto = dto.replace(
  /\/\*\* lastSalesDateAsc[^*]*\*\/\s*@IsOptional\(\)/,
  "/** lastSalesDateAsc (默认) | staleDesc | gmvDesc */\n  @IsOptional()"
);
fs.writeFileSync(dtoPath, dto, 'utf8');
console.log('dto fixed');

// Inspect list head imports
const list = fs.readFileSync(path.resolve('apps/api/src/zero-sales/zero-sales-list.ts'), 'utf8');
console.log('==== LIST HEAD ====');
console.log(list.split('// ---')[0]);
console.log('==== LOADERS HEAD ====');
const loaders = fs.readFileSync(path.resolve('apps/api/src/zero-sales/zero-sales-loaders.ts'), 'utf8');
console.log(loaders.split('// ---')[0]);
console.log('==== CSV ====');
console.log(fs.readFileSync(csvPath, 'utf8'));
