/** Consolidated merchant-sales module. */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { recomputeMerchantDailyMetrics } from './merchant-sales-query';
import type { MerchantSalesSurfaceParams } from './merchant-sales-surface';

// --- merchant-sales-recompute.ts ---
export async function recomputeMerchantSalesRange(
  prisma: PrismaService,
  logger: Logger,
  startDate: string,
  endDate: string,
  lastRefreshAt: number,
  minIntervalMs: number,
  invalidate: () => void
): Promise<{ startDate: string; endDate: string; rowsUpserted: number; lastRefreshAt: number }> {
  if (lastRefreshAt > 0 && Date.now() - lastRefreshAt < minIntervalMs) {
    logger.warn(`recomputeRange throttled: last call was ${Date.now() - lastRefreshAt}ms ago`);
    return { startDate, endDate, rowsUpserted: 0, lastRefreshAt };
  }
  const nextRefreshAt = Date.now();
  const rows = await recomputeMerchantDailyMetrics(prisma, startDate, endDate);
  invalidate();
  logger.log(`recomputeRange [${startDate} → ${endDate}] rowsUpserted=${rows}`);
  return { startDate, endDate, rowsUpserted: rows, lastRefreshAt: nextRefreshAt };
}

// --- merchant-sales-recompute-surface.ts ---
export function createMerchantSalesRecomputeSurface(params: MerchantSalesSurfaceParams) {
  return {
    recomputeRange: async (startDate: string, endDate: string) => {
      const result = await recomputeMerchantSalesRange(
        params.prisma,
        params.logger,
        startDate,
        endDate,
        params.getLastRefreshAt(),
        params.refreshMinIntervalMs,
        params.invalidateCache
      );
      params.setLastRefreshAt(result.lastRefreshAt);
      return {
        startDate: result.startDate,
        endDate: result.endDate,
        rowsUpserted: result.rowsUpserted
      };
    }
  };
}
