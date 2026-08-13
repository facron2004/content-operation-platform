/** Consolidated GMV module. */
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { AutoLoginService } from '../content/auto-login.service';
import { JobRunnerService } from '../jobs/job-runner.service';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { OverviewService } from '../overview/overview.service';
import { PrismaService } from '../prisma/prisma.service';
import { RefundService } from '../refund/refund.service';
import { refreshGmvFromJeesite } from './gmv-refresh';
import {
  getGmvRefreshJob,
  getPersistedGmvRefreshJob,
  startGmvRefreshJob,
  type GmvRefreshJob
} from './gmv-refresh-job';
import {
  computeGmvTopMerchants,
  resolveGmvDistribution,
  resolveGmvHourly,
  resolveGmvKpis,
  resolveGmvTrend
} from './gmv-resolve';
import { pageMerchants } from './gmv-metrics';
import type {
  GmvDistributionDim,
  GmvDistributionPayload,
  GmvHourlyPoint,
  GmvMerchantRow,
  GmvMerchantSort,
  GmvTodayPayload,
  GmvTrendPoint,
  TrendGranularity,
  TrendWindow
} from './gmv.dto';

/** Money KPI payloads are small but multi-key (date/force) — keep a tight maxSize. */
const GMV_CACHE_TTL_MS = 60_000;

async function gmvHeavyLoad<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await withHeavyAggregateGate(load);
  } catch (err) {
    if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
      throw new ConflictException('GMV 计算繁忙，请稍后再试');
    }
    throw err;
  }
}

// --- gmv-service-cache.ts ---
export function createGmvCacheMethods(cache: TtlCache, prisma: PrismaService) {
  return {
    getKpis(date?: string, force = false): Promise<GmvTodayPayload> {
      return cache.getOrLoad(`gmvToday:${date ?? 'today'}`, force, () =>
        gmvHeavyLoad(() => resolveGmvKpis(prisma, date))
      );
    },
    getTrend(
      days: TrendWindow,
      endDate?: string,
      force = false,
      granularity: TrendGranularity = 'day'
    ): Promise<GmvTrendPoint[]> {
      return cache.getOrLoad(`gmvTrend:${granularity}:${days}:${endDate ?? 'today'}`, force, () =>
        gmvHeavyLoad(() => resolveGmvTrend(prisma, days, endDate, granularity))
      );
    },
    getHourly(date?: string, force = false): Promise<GmvHourlyPoint[]> {
      return cache.getOrLoad(`gmvHourly:${date ?? 'today'}`, force, () =>
        gmvHeavyLoad(() => resolveGmvHourly(prisma, date))
      );
    },
    getDistribution(dim: GmvDistributionDim, limit: number, force = false, date?: string) {
      return cache.getOrLoad(`gmvDist:${dim}:${limit}:${date ?? 'recent7'}`, force, () =>
        gmvHeavyLoad(() => resolveGmvDistribution(prisma, dim, limit, date))
      ) as Promise<GmvDistributionPayload>;
    },
    getTopMerchants(
      sortBy: GmvMerchantSort,
      page: number,
      pageSize: number,
      force = false,
      date?: string
    ) {
      // Aggregate cache key excludes page so flips share one sorted merchant list.
      return cache
        .getOrLoad(`gmvMerchants:${sortBy}:${date ?? 'recent7'}`, force, () =>
          gmvHeavyLoad(() => computeGmvTopMerchants(prisma, sortBy, date))
        )
        .then((rows) => pageMerchants(rows, page, pageSize)) as Promise<{
        items: GmvMerchantRow[];
        hasMore: boolean;
        limit: number;
        truncated: boolean;
      }>;
    },
    invalidateCache(prefix?: string) {
      cache.clear(prefix);
    }
  };
}

// --- gmv-service-ops.ts ---
export function createGmvServiceOps(
  cache: TtlCache,
  prisma: PrismaService,
  autoLogin?: AutoLoginService,
  merchantSales?: MerchantSalesService,
  onMoneyWrite?: () => void,
  jobRunner?: JobRunnerService
) {
  const ops = createGmvCacheMethods(cache, prisma);
  // Serialize refresh: concurrent tabs must not double-pull Jeesite, and a later
  // call with a different [start,end] must not inherit the first call's result.
  let refreshTail: Promise<unknown> = Promise.resolve();
  return {
    ...ops,
    refreshFromJeesite(startDate: string, endDate: string) {
      const run = refreshTail
        .catch(() => undefined)
        .then(() =>
          refreshGmvFromJeesite({
            prisma,
            autoLogin,
            getMerchantSalesService: async () => merchantSales ?? null,
            invalidateCache: () => {
              ops.invalidateCache();
              onMoneyWrite?.();
            },
            startDate,
            endDate
          })
        );
      // Keep the chain alive even if this run fails so the next caller still waits.
      refreshTail = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
    startRefreshJob(startDate: string, endDate: string): GmvRefreshJob {
      return startGmvRefreshJob(
        {
          prisma,
          autoLogin,
          getMerchantSalesService: async () => merchantSales ?? null,
          invalidateCache: () => {
            ops.invalidateCache();
            onMoneyWrite?.();
          },
          getKpis: (date: string) => ops.getKpis(date, false),
          jobRunner
        },
        startDate,
        endDate
      );
    },
    async getRefreshJob(jobId: string): Promise<GmvRefreshJob | undefined> {
      return getGmvRefreshJob(jobId) ?? (await getPersistedGmvRefreshJob(jobId, jobRunner));
    }
  };
}

// --- gmv.service.ts ---
export type {
  GmvTodayPayload,
  GmvTrendPoint,
  GmvHourlyPoint,
  GmvDistributionRow,
  GmvDistributionPayload,
  GmvMerchantRow
} from './gmv.dto';

/** GMV = paidAmount + paidAmountWallet; 净 GMV = GMV − refundAmount; bonus 不计入分母 */

@Injectable()
export class GmvService {
  private readonly ops;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Optional() @Inject(AutoLoginService) autoLogin?: AutoLoginService,
    @Optional() @Inject(MerchantSalesService) merchantSales?: MerchantSalesService,
    @Optional() @Inject(OverviewService) overview?: OverviewService,
    @Optional() @Inject(RefundService) refund?: RefundService,
    @Optional() @Inject(JobRunnerService) jobRunner?: JobRunnerService
  ) {
    this.ops = createGmvServiceOps(
      new TtlCache(GMV_CACHE_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE),
      prisma,
      autoLogin,
      merchantSales,
      () => {
        overview?.invalidateCache();
        refund?.invalidateCache();
      },
      jobRunner
    );
  }

  getKpis(date?: string, force = false) {
    return this.ops.getKpis(date, force);
  }

  getTrend(
    days: TrendWindow,
    endDate?: string,
    force = false,
    granularity: TrendGranularity = 'day'
  ) {
    return this.ops.getTrend(days, endDate, force, granularity);
  }

  getHourly(date?: string, force = false) {
    return this.ops.getHourly(date, force);
  }

  getDistribution(dim: GmvDistributionDim, limit: number, force = false, date?: string) {
    return this.ops.getDistribution(dim, limit, force, date);
  }

  getTopMerchants(
    sortBy: GmvMerchantSort,
    page: number,
    pageSize: number,
    force = false,
    date?: string
  ) {
    return this.ops.getTopMerchants(sortBy, page, pageSize, force, date);
  }

  invalidateCache(prefix?: string) {
    this.ops.invalidateCache(prefix);
  }

  refreshFromJeesite(startDate: string, endDate: string) {
    return this.ops.refreshFromJeesite(startDate, endDate);
  }

  startRefreshJob(startDate: string, endDate: string): GmvRefreshJob {
    return this.ops.startRefreshJob(startDate, endDate);
  }

  getRefreshJob(jobId: string): Promise<GmvRefreshJob | undefined> {
    return this.ops.getRefreshJob(jobId);
  }
}
