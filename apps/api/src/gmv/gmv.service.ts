/** Consolidated GMV module. */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { TtlCache } from '../common';
import { AutoLoginService } from '../content/auto-login.service';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { OverviewService } from '../overview/overview.service';
import { PrismaService } from '../prisma/prisma.service';
import { RefundService } from '../refund/refund.service';
import { refreshGmvFromJeesite } from './gmv-refresh';
import {
  resolveGmvDistribution,
  resolveGmvHourly,
  resolveGmvKpis,
  resolveGmvTopMerchants,
  resolveGmvTrend
} from './gmv-resolve';
import type {
  GmvDistributionDim,
  GmvDistributionRow,
  GmvHourlyPoint,
  GmvMerchantRow,
  GmvMerchantSort,
  GmvTodayPayload,
  GmvTrendPoint,
  TrendGranularity,
  TrendWindow
} from './gmv.dto';

// --- gmv-service-cache.ts ---
export function createGmvCacheMethods(cache: TtlCache, prisma: PrismaService) {
  return {
    getKpis(date?: string, force = false): Promise<GmvTodayPayload> {
      return cache.getOrLoad(`gmvToday:${date ?? 'today'}`, force, () =>
        resolveGmvKpis(prisma, date)
      );
    },
    getTrend(
      days: TrendWindow,
      endDate?: string,
      force = false,
      granularity: TrendGranularity = 'day'
    ): Promise<GmvTrendPoint[]> {
      return cache.getOrLoad(`gmvTrend:${granularity}:${days}:${endDate ?? 'today'}`, force, () =>
        resolveGmvTrend(prisma, days, endDate, granularity)
      );
    },
    getHourly(date?: string, force = false): Promise<GmvHourlyPoint[]> {
      return cache.getOrLoad(`gmvHourly:${date ?? 'today'}`, force, () =>
        resolveGmvHourly(prisma, date)
      );
    },
    getDistribution(dim: GmvDistributionDim, limit: number, force = false) {
      return cache.getOrLoad(`gmvDist:${dim}:${limit}`, force, () =>
        resolveGmvDistribution(prisma, dim, limit)
      ) as Promise<GmvDistributionRow[]>;
    },
    getTopMerchants(sortBy: GmvMerchantSort, page: number, pageSize: number, force = false) {
      return cache.getOrLoad(`gmvMerchants:${sortBy}:${page}:${pageSize}`, force, () =>
        resolveGmvTopMerchants(prisma, sortBy, page, pageSize)
      ) as Promise<{ items: GmvMerchantRow[]; hasMore: boolean }>;
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
  onMoneyWrite?: () => void
) {
  const ops = createGmvCacheMethods(cache, prisma);
  return {
    ...ops,
    refreshFromJeesite(startDate: string, endDate: string) {
      return refreshGmvFromJeesite({
        prisma,
        autoLogin,
        getMerchantSalesService: async () => merchantSales ?? null,
        invalidateCache: () => {
          ops.invalidateCache();
          onMoneyWrite?.();
        },
        startDate,
        endDate
      });
    }
  };
}

// --- gmv.service.ts ---
export type {
  GmvTodayPayload,
  GmvTrendPoint,
  GmvHourlyPoint,
  GmvDistributionRow,
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
    @Optional() @Inject(RefundService) refund?: RefundService
  ) {
    this.ops = createGmvServiceOps(new TtlCache(), prisma, autoLogin, merchantSales, () => {
      overview?.invalidateCache();
      refund?.invalidateCache();
    });
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

  getDistribution(dim: GmvDistributionDim, limit: number, force = false) {
    return this.ops.getDistribution(dim, limit, force);
  }

  getTopMerchants(sortBy: GmvMerchantSort, page: number, pageSize: number, force = false) {
    return this.ops.getTopMerchants(sortBy, page, pageSize, force);
  }

  invalidateCache(prefix?: string) {
    this.ops.invalidateCache(prefix);
  }

  refreshFromJeesite(startDate: string, endDate: string) {
    return this.ops.refreshFromJeesite(startDate, endDate);
  }
}
