import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../common/heavy-aggregate-gate';
import { loadTopOffenders } from './overview-stale';
import { loadTrendRows } from './overview-trend';
import { loadOverviewDistribution } from './overview-distribution';
import { loadOverviewKpis } from './overview-kpis';

export type {
  OverviewDistributionRow,
  OverviewKpiPayload,
  OverviewTopOffender,
  OverviewTrendPoint
} from './overview.types';

/** Overview KPI/top-offenders are multi-query catalog reads — short TTL + size bound. */
const OVERVIEW_TTL_MS = 60_000;

@Injectable()
export class OverviewService {
  private readonly cache = new TtlCache(OVERVIEW_TTL_MS, HEAVY_LIST_CACHE_MAX_SIZE);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getKpis(date?: string, force = false) {
    // loadOverviewKpis already getOrLoad-coalesces; gate only runs on cold loaders.
    const asOf = date ?? beijingDateKey(new Date());
    return this.mapQueue(() => loadOverviewKpis(this.prisma, this.cache, asOf, true, force));
  }

  getTrend(days: number, endDate?: string, force = false) {
    const end = endDate ?? beijingDateKey(new Date());
    return this.mapQueue(() =>
      this.cache.getOrLoad(`trend:${days}:${end}`, force, () =>
        withHeavyAggregateGate(async () => {
          return loadTrendRows(this.prisma, shiftDateKey(end, -(days - 1)), end);
        })
      )
    );
  }

  getDistribution(dim: 'area' | 'category' | 'stale', limit: number, force = false, date?: string) {
    const asOf = dim === 'stale' ? (date ?? beijingDateKey(new Date())) : undefined;
    return this.mapQueue(() =>
      this.cache.getOrLoad(`dist:${dim}:${limit}:${asOf ?? 'current-master'}`, force, () =>
        withHeavyAggregateGate(() => loadOverviewDistribution(this.prisma, dim, limit, asOf, force))
      )
    );
  }

  getTopOffenders(n: number, force = false, date?: string) {
    const asOf = date ?? beijingDateKey(new Date());
    return this.mapQueue(() =>
      this.cache.getOrLoad(`topOffenders:${n}:${asOf}`, force, () =>
        withHeavyAggregateGate(() => loadTopOffenders(this.prisma, n, asOf))
      )
    );
  }

  invalidateCache(prefix?: string) {
    this.cache.clear(prefix);
  }

  private async mapQueue<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('总览计算繁忙，请稍后再试');
      }
      throw err;
    }
  }
}
