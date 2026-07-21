/** Consolidated zero-sales module. */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { listZeroSalesMerchants, listZeroSalesSkus } from './zero-sales-list';
import { loadSkuTimeline } from './zero-sales-loaders';
import { ZeroSalesMerchantsQueryDto, ZeroSalesSkusQueryDto } from './zero-sales.dto';

// --- zero-sales.service.ts ---
/** 中台数据层：零动销清单（商家 + SKU）。 */
@Injectable()
export class ZeroSalesService {
  private readonly logger = new Logger(ZeroSalesService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  listMerchants(q: ZeroSalesMerchantsQueryDto) {
    return listZeroSalesMerchants(this.prisma, q);
  }
  listSkus(q: ZeroSalesSkusQueryDto) {
    return listZeroSalesSkus(this.prisma, q);
  }
  getSkuTimeline(packageId: string, days: number) {
    return loadSkuTimeline(this.prisma, packageId, days);
  }
}
