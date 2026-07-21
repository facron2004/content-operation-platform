import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MerchantTrendQueryDto, MerchantsListQueryDto } from './merchant.dto';
import { listMerchantsWithStale } from './merchant-list';
import { buildMerchantProfile } from './merchant-profile';
import { loadMerchantTrendPayload } from './merchant-trend';
import { loadMerchantSkuRows, mapMerchantSkuRows } from './merchant-sku';
import { loadCompetitors } from './merchant-competitors';
import { buildMerchantHeatmap } from './merchant-heatmap';
import { upsertMerchantsFromPackages } from './merchant-address-updater';

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listMerchants(q: MerchantsListQueryDto) {
    return listMerchantsWithStale({ prisma: this.prisma, query: q });
  }

  getProfile(merchantId: string) {
    return buildMerchantProfile(this.prisma, merchantId);
  }

  getTrend(merchantId: string, query: MerchantTrendQueryDto) {
    return loadMerchantTrendPayload(this.prisma, merchantId, query.days);
  }

  async listSkus(merchantId: string, _query: MerchantTrendQueryDto) {
    const items = mapMerchantSkuRows(await loadMerchantSkuRows(this.prisma, merchantId));
    return { merchantId, count: items.length, items };
  }

  async listCompetitors(merchantId: string) {
    return { merchantId, competitors: await loadCompetitors(this.prisma, merchantId) };
  }

  getHeatmap() {
    return buildMerchantHeatmap(this.prisma);
  }

  refreshAddresses() {
    return upsertMerchantsFromPackages(this.prisma);
  }
}
