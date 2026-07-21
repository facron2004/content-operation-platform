/** Merchant-sales query + recompute surface. */
import { Logger } from '@nestjs/common';
import { TtlCache } from '../common';
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

function createMerchantSalesQuerySurface({ prisma, cache }: MerchantSalesSurfaceParams) {
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
    getExport: (
      window: MerchantSalesWindow,
      date?: string,
      endDate?: string,
      sortBy: MerchantSalesSort = 'gmvDesc'
    ) => {
      const { start, end } = resolveWindow(window, date, endDate);
      return queryExportCsv(prisma, window, start, end, sortBy);
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
