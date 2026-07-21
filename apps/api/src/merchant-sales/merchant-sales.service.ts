/** Merchant sales service facade. */
import { Inject, Injectable } from '@nestjs/common';
import { TtlCache } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { createMerchantSalesServiceMethods } from './merchant-sales-surface';
export { MERCHANT_SALES_SERVICE } from './merchant-sales.dto';
export type {
  MerchantSalesRanking,
  MerchantSalesRankingRow,
  MerchantSalesSummary,
  MerchantSalesTrendPoint
} from './merchant-sales.dto';

@Injectable()
export class MerchantSalesService {
  private readonly cache = new TtlCache();
  private readonly lastRefreshAt = { value: 0 };
  private static readonly REFRESH_MIN_INTERVAL_MS = 10_000;
  private readonly api: ReturnType<typeof createMerchantSalesServiceMethods>;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.api = createMerchantSalesServiceMethods({
      prisma,
      cache: this.cache,
      lastRefreshAt: this.lastRefreshAt,
      refreshMinIntervalMs: MerchantSalesService.REFRESH_MIN_INTERVAL_MS,
      invalidateCache: () => this.invalidateCache()
    });
  }

  getSummary(...a: Parameters<MerchantSalesService['api']['getSummary']>) {
    return this.api.getSummary(...a);
  }
  getRanking(...a: Parameters<MerchantSalesService['api']['getRanking']>) {
    return this.api.getRanking(...a);
  }
  getTrend(...a: Parameters<MerchantSalesService['api']['getTrend']>) {
    return this.api.getTrend(...a);
  }
  getExport(...a: Parameters<MerchantSalesService['api']['getExport']>) {
    return this.api.getExport(...a);
  }
  recomputeRange(...a: Parameters<MerchantSalesService['api']['recomputeRange']>) {
    return this.api.recomputeRange(...a);
  }
  invalidateCache(): void {
    this.cache.clear();
  }
}
