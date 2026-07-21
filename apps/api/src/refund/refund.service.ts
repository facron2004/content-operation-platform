/** Consolidated refund module. */
import { Inject, Injectable } from '@nestjs/common';
import { TtlCache } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { createRefundServiceSurface } from './refund-load';
import {
  type RefundTodayPayload,
  type RefundTopMerchantsQueryDto,
  type RefundTrendPoint,
  type RefundVerifyTodayPayload,
  type TopMerchantRow,
  type VerifyTrendPoint
} from './refund.dto';
export type {
  RefundTodayPayload,
  RefundTrendPoint,
  RefundVerifyTodayPayload,
  TopMerchantRow,
  VerifyTrendPoint
} from './refund.dto';

// --- refund.service.ts ---
@Injectable()
export class RefundService {
  private readonly cache = new TtlCache();
  private readonly surface;
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.surface = createRefundServiceSurface(prisma, this.cache);
  }
  getRefundToday(date?: string): Promise<RefundTodayPayload> {
    return this.surface.getRefundToday(date);
  }
  getRefundTrend(days: 7 | 30, endDate?: string): Promise<RefundTrendPoint[]> {
    return this.surface.getRefundTrend(days, endDate);
  }
  getVerifyToday(date?: string): Promise<RefundVerifyTodayPayload> {
    return this.surface.getVerifyToday(date);
  }
  getVerifyTrend(days: 7 | 30, endDate?: string): Promise<VerifyTrendPoint[]> {
    return this.surface.getVerifyTrend(days, endDate);
  }
  getTopMerchants(
    q: RefundTopMerchantsQueryDto
  ): Promise<{ items: TopMerchantRow[]; hasMore: boolean }> {
    return this.surface.getTopMerchants(q);
  }
  invalidateCache(prefix?: string) {
    this.cache.clear(prefix);
  }
}
