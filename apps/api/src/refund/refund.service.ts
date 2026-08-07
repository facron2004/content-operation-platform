/** Consolidated refund module. */
import { Inject, Injectable } from '@nestjs/common';
import { TtlCache } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { PrismaService } from '../prisma/prisma.service';
import { createRefundServiceSurface } from './refund-load';
import {
  type RefundTodayPayload,
  type RefundTodayQueryDto,
  type RefundTopMerchantsQueryDto,
  type RefundTrendPoint,
  type RefundTrendQueryDto,
  type RefundVerifyTodayPayload,
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
/** Refund/verify day aggregates — short TTL + size bound (parity GMV/overview). */
const REFUND_CACHE_TTL_MS = 60_000;

@Injectable()
export class RefundService {
  private readonly cache = new TtlCache(REFUND_CACHE_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);
  private readonly surface;
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.surface = createRefundServiceSurface(prisma, this.cache);
  }
  getRefundToday(q: RefundTodayQueryDto): Promise<RefundTodayPayload> {
    return this.surface.getRefundToday(q);
  }
  getRefundTrend(q: RefundTrendQueryDto): Promise<RefundTrendPoint[]> {
    return this.surface.getRefundTrend(q);
  }
  getVerifyToday(q: RefundTodayQueryDto): Promise<RefundVerifyTodayPayload> {
    return this.surface.getVerifyToday(q);
  }
  getVerifyTrend(q: RefundTrendQueryDto): Promise<VerifyTrendPoint[]> {
    return this.surface.getVerifyTrend(q);
  }
  getTopMerchants(
    q: RefundTopMerchantsQueryDto
  ): Promise<{ items: import('./refund.dto').TopMerchantRow[]; hasMore: boolean }> {
    return this.surface.getTopMerchants(q);
  }
  invalidateCache(prefix?: string) {
    this.cache.clear(prefix);
  }
}
