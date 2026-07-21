/** Consolidated merchant-sales module. */
import { TtlCache } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWindow } from './merchant-sales-window';
import { loadRankingPage, querySummary, queryTrendRows } from './merchant-sales-query';
import type {
  MerchantSalesRanking,
  MerchantSalesSort,
  MerchantSalesSummary,
  MerchantSalesTrendPoint,
  MerchantSalesWindow
} from './merchant-sales.dto';

// --- merchant-sales-cache-keys.ts ---
export const merchantSalesCacheKeys = {
  summary: (window: MerchantSalesWindow, start: string, end: string) =>
    `summary:${window}:${start}:${end}`,
  ranking: (
    window: MerchantSalesWindow,
    start: string,
    end: string,
    sortBy: MerchantSalesSort,
    page: number,
    pageSize: number
  ) => `ranking:${window}:${start}:${end}:${sortBy}:${page}:${pageSize}`,
  trend: (window: MerchantSalesWindow, start: string, end: string) =>
    `trend:${window}:${start}:${end}`
};

// --- merchant-sales-cache.ts ---
export async function getCachedOrLoad<T>(options: {
  cache: TtlCache;
  cacheKey: string;
  force?: boolean;
  load: () => Promise<T>;
}): Promise<T> {
  return options.cache.getOrLoad(options.cacheKey, Boolean(options.force), options.load);
}

// --- merchant-sales-load-summary.ts ---
export async function loadMerchantSalesSummary(
  prisma: PrismaService,
  cache: TtlCache,
  window: MerchantSalesWindow,
  date: string | undefined,
  endDate: string | undefined,
  force = false
): Promise<MerchantSalesSummary> {
  const { start, end } = resolveWindow(window, date, endDate);
  return getCachedOrLoad({
    cache,
    cacheKey: merchantSalesCacheKeys.summary(window, start, end),
    force,
    load: () => querySummary(prisma, window, start, end)
  });
}

// --- merchant-sales-load-lists.ts ---
export async function loadMerchantSalesRanking(
  prisma: PrismaService,
  cache: TtlCache,
  args: {
    window: MerchantSalesWindow;
    date?: string;
    endDate?: string;
    sortBy: MerchantSalesSort;
    page: number;
    pageSize: number;
    force?: boolean;
  }
): Promise<MerchantSalesRanking> {
  const { start, end } = resolveWindow(args.window, args.date, args.endDate);
  return getCachedOrLoad({
    cache,
    cacheKey: merchantSalesCacheKeys.ranking(
      args.window,
      start,
      end,
      args.sortBy,
      args.page,
      args.pageSize
    ),
    force: args.force,
    load: () => loadRankingPage(prisma, args, start, end)
  });
}

// --- merchant-sales-load-trend.ts ---
export async function loadMerchantSalesTrend(
  prisma: PrismaService,
  cache: TtlCache,
  window: Exclude<MerchantSalesWindow, 'day'>,
  date: string | undefined,
  endDate: string | undefined,
  force = false
): Promise<{ items: MerchantSalesTrendPoint[]; window: MerchantSalesWindow }> {
  const { start, end } = resolveWindow(window, date, endDate);
  return getCachedOrLoad({
    cache,
    cacheKey: merchantSalesCacheKeys.trend(window, start, end),
    force,
    load: async () => ({ items: await queryTrendRows(prisma, window, start, end), window })
  });
}
