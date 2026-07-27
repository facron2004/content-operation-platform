/** Merchant-sales query + recompute surface. */
import { ConflictException, Logger } from '@nestjs/common';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { queryExportCsv } from './merchant-sales-query';
import {
  loadMerchantSalesRanking,
  loadMerchantSalesSummary,
  loadMerchantSalesTrend
} from './merchant-sales-load';
import { createMerchantSalesRecomputeSurface } from './merchant-sales-recompute';
import { resolveWindow } from './merchant-sales-window';
import type { MerchantSalesSort, MerchantSalesWindow } from './merchant-sales.dto';

export type MerchantSalesSurfaceParams = {
  prisma: PrismaService;
  cache: TtlCache;
  logger: Logger;
  getLastRefreshAt: () => number;
  setLastRefreshAt: (value: number) => void;
  refreshMinIntervalMs: number;
  invalidateCache: () => void;
};

function createMerchantSalesQuerySurface(params: MerchantSalesSurfaceParams) {
  const { prisma, cache, logger } = params;
  // Single-flight CSV export — concurrent tabs must not double-run ranking GROUP BY.
  let exportRunning = false;
  return {
    getSummary: (window: MerchantSalesWindow, date?: string, endDate?: string, force = false) =>
      loadMerchantSalesSummary(prisma, cache, window, date, endDate, force),
    getRanking: (
      window: MerchantSalesWindow,
      date?: string,
      endDate?: string,
      sortBy: MerchantSalesSort = 'gmvDesc',
      page = 1,
      pageSize = 20,
      force = false
    ) =>
      loadMerchantSalesRanking(prisma, cache, {
        window,
        date,
        endDate,
        sortBy,
        page,
        pageSize,
        force
      }),
    getTrend: (
      window: Exclude<MerchantSalesWindow, 'day'>,
      date?: string,
      endDate?: string,
      force = false
    ) => loadMerchantSalesTrend(prisma, cache, window, date, endDate, force),
    getExport: async (
      window: MerchantSalesWindow,
      date?: string,
      endDate?: string,
      sortBy: MerchantSalesSort = 'gmvDesc'
    ) => {
      if (exportRunning) {
        logger.warn('Skipping merchant-sales export — previous run still in flight');
        throw new ConflictException('商家销售导出进行中，请稍后再试');
      }
      exportRunning = true;
      try {
        const { start, end } = resolveWindow(window, date, endDate);
        // Share process heavy pool so export GROUP BY cannot run beside GMV/movement cold.
        return await withHeavyAggregateGate(() =>
          queryExportCsv(prisma, window, start, end, sortBy)
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
          throw new ConflictException('商家销售导出繁忙，请稍后再试');
        }
        throw err;
      } finally {
        exportRunning = false;
      }
    }
  };
}

export function createMerchantSalesSurface(params: MerchantSalesSurfaceParams) {
  return {
    ...createMerchantSalesQuerySurface(params),
    ...createMerchantSalesRecomputeSurface(params)
  };
}

export function createMerchantSalesServiceMethods(deps: {
  prisma: PrismaService;
  cache: TtlCache;
  lastRefreshAt: { value: number };
  refreshMinIntervalMs: number;
  invalidateCache: () => void;
}) {
  return createMerchantSalesSurface({
    prisma: deps.prisma,
    cache: deps.cache,
    logger: new Logger('MerchantSalesService'),
    getLastRefreshAt: () => deps.lastRefreshAt.value,
    setLastRefreshAt: (v) => {
      deps.lastRefreshAt.value = v;
    },
    refreshMinIntervalMs: deps.refreshMinIntervalMs,
    invalidateCache: deps.invalidateCache
  });
}
