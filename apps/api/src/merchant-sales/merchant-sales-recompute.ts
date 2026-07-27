/** Consolidated merchant-sales module. */
import { Logger } from '@nestjs/common';
import { heavyAggregateInFlight, withHeavyAggregateGate } from '../common';
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
  // Stamp before work so concurrent callers hit the throttle gate (check-then-set race closed).
  const nextRefreshAt = Date.now();
  // Share process-wide heavy gate with interactive money aggregates (residual #85).
  // When GMV refresh already holds a gate slot and calls merchant recompute nested,
  // re-entering the gate would deadlock — run bare if already inside.
  const rows =
    heavyAggregateInFlight() > 0
      ? await recomputeMerchantDailyMetrics(prisma, startDate, endDate)
      : await withHeavyAggregateGate(() =>
          recomputeMerchantDailyMetrics(prisma, startDate, endDate)
        );
  invalidate();
  logger.log(`recomputeRange [${startDate} → ${endDate}] rowsUpserted=${rows}`);
  return { startDate, endDate, rowsUpserted: rows, lastRefreshAt: nextRefreshAt };
}

// --- merchant-sales-recompute-surface.ts ---
export function createMerchantSalesRecomputeSurface(params: MerchantSalesSurfaceParams) {
  // Serialize recompute: concurrent tabs must not race, and different ranges
  // must each run (not inherit another range's result).
  let recomputeTail: Promise<unknown> = Promise.resolve();
  return {
    recomputeRange: async (startDate: string, endDate: string) => {
      const last = params.getLastRefreshAt();
      if (last > 0 && Date.now() - last < params.refreshMinIntervalMs) {
        params.logger.warn(`recomputeRange throttled: last call was ${Date.now() - last}ms ago`);
        return { startDate, endDate, rowsUpserted: 0 };
      }
      // Stamp before enqueue so a second concurrent caller hits the throttle gate.
      params.setLastRefreshAt(Date.now());
      const run = recomputeTail
        .catch(() => undefined)
        .then(() =>
          recomputeMerchantSalesRange(
            params.prisma,
            params.logger,
            startDate,
            endDate,
            // Surface already enforced the interval.
            0,
            params.refreshMinIntervalMs,
            params.invalidateCache
          )
        )
        .then((result) => {
          params.setLastRefreshAt(result.lastRefreshAt);
          return {
            startDate: result.startDate,
            endDate: result.endDate,
            rowsUpserted: result.rowsUpserted
          };
        });
      recomputeTail = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}
