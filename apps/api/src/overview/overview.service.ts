import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { TtlCache } from '../common';
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

@Injectable()
export class OverviewService {
  private readonly cache = new TtlCache();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getKpis(date?: string) {
    return loadOverviewKpis(this.prisma, this.cache, date);
  }

  getTrend(days: number, endDate?: string) {
    return this.cache.getOrLoad(`trend:${days}:${endDate ?? 'today'}`, false, async () => {
      const end = endDate ?? beijingDateKey(new Date());
      return loadTrendRows(this.prisma, shiftDateKey(end, -(days - 1)), end);
    });
  }

  getDistribution(dim: 'area' | 'category' | 'stale', limit: number) {
    return this.cache.getOrLoad(`dist:${dim}:${limit}`, false, () =>
      loadOverviewDistribution(this.prisma, dim, limit)
    );
  }

  getTopOffenders(n: number) {
    return this.cache.getOrLoad(`topOffenders:${n}`, false, () => loadTopOffenders(this.prisma, n));
  }

  invalidateCache(prefix?: string) {
    this.cache.clear(prefix);
  }
}
