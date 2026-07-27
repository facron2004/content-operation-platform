/** Consolidated merchant-sales module. */
import { ConflictException } from '@nestjs/common';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { clampListPage, clampListPageSize, GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWindow } from './merchant-sales-window';
import {
  countMerchants,
  paginateRankingRows,
  queryAllRankingRows,
  querySummary,
  queryTrendRows
} from './merchant-sales-query';
import type {
  MerchantSalesRanking,
  MerchantSalesRankingRow,
  MerchantSalesSort,
  MerchantSalesSummary,
  MerchantSalesTrendPoint,
  MerchantSalesWindow
} from './merchant-sales.dto';

// --- merchant-sales-cache-keys.ts ---
export const merchantSalesCacheKeys = {
  summary: (window: MerchantSalesWindow, start: string, end: string) =>
    `summary:${window}:${start}:${end}`,
  /** Page-less aggregate key — page flips share one sorted list. */
  ranking: (window: MerchantSalesWindow, start: string, end: string, sortBy: MerchantSalesSort) =>
    `ranking:${window}:${start}:${end}:${sortBy}`,
  /** Residual #264: sort-independent DISTINCT merchant count for ranking honesty. */
  rankingCount: (window: MerchantSalesWindow, start: string, end: string) =>
    `ranking-count:${window}:${start}:${end}`,
  trend: (window: MerchantSalesWindow, start: string, end: string) =>
    `trend:${window}:${start}:${end}`
};

async function msHeavyLoad<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await withHeavyAggregateGate(load);
  } catch (err) {
    if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
      throw new ConflictException('商家销售计算繁忙，请稍后再试');
    }
    throw err;
  }
}

// --- merchant-sales-cache.ts ---
export async function getCachedOrLoad<T>(options: {
  cache: TtlCache;
  cacheKey: string;
  force?: boolean;
  load: () => Promise<T>;
}): Promise<T> {
  return options.cache.getOrLoad(options.cacheKey, Boolean(options.force), () =>
    msHeavyLoad(options.load)
  );
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
  // Defense-in-depth: DTO Max may be bypassed; deep OFFSET was a SQLite pain point.
  const page = clampListPage(args.page, 100);
  const pageSize = clampListPageSize(args.pageSize, 100, 20);
  // Residual #264: materialise capped ranking + real merchant COUNT in parallel
  // (count key is sort-independent so page/sort flips reuse it).
  const [all, totalMerchants] = await Promise.all([
    getCachedOrLoad<MerchantSalesRankingRow[]>({
      cache,
      cacheKey: merchantSalesCacheKeys.ranking(args.window, start, end, args.sortBy),
      force: args.force,
      load: () => queryAllRankingRows(prisma, args.window, start, end, args.sortBy)
    }),
    getCachedOrLoad<number>({
      cache,
      cacheKey: merchantSalesCacheKeys.rankingCount(args.window, start, end),
      force: args.force,
      load: () => countMerchants(prisma, args.window, start, end)
    })
  ]);
  return paginateRankingRows(all, page, pageSize, {
    totalMerchants,
    limit: GMV_TOP_MERCHANTS_LIMIT
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
