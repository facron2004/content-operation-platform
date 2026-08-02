import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FreshnessMetric {
  entity: string;
  lastUpdatedAt: string | null;
  lagSeconds: number | null;
  status: 'healthy' | 'lagging' | 'unknown';
}

@Injectable()
export class DataFreshnessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getFreshnessReport(): Promise<{
    metrics: FreshnessMetric[];
    checkedAt: string;
  }> {
    const now = new Date();

    const tpdRows = await this.prisma.$queryRawUnsafe<[{ maxTime: string | null }]>(
      `SELECT MAX("computedAt") as maxTime FROM "TaskPerformanceDaily"`
    );
    const attrRows = await this.prisma.$queryRawUnsafe<[{ maxTime: string | null }]>(
      `SELECT MAX("attributedAt") as maxTime FROM "OrderAttribution"`
    );
    const mdmRows = await this.prisma.$queryRawUnsafe<[{ maxTime: string | null }]>(
      `SELECT MAX("updatedAt") as maxTime FROM "MerchantDailyMetrics"`
    );

    const metrics: FreshnessMetric[] = [
      this.buildMetric('TaskPerformanceDaily', tpdRows[0]?.maxTime ?? null, now, 7200),
      this.buildMetric('OrderAttribution', attrRows[0]?.maxTime ?? null, now, 86400),
      this.buildMetric('MerchantDailyMetrics', mdmRows[0]?.maxTime ?? null, now, 86400)
    ];

    return {
      metrics,
      checkedAt: now.toISOString()
    };
  }

  private buildMetric(
    entity: string,
    lastTimeStr: string | null,
    now: Date,
    maxLagAllowed: number
  ): FreshnessMetric {
    if (!lastTimeStr) {
      return { entity, lastUpdatedAt: null, lagSeconds: null, status: 'unknown' };
    }
    const lastDate = new Date(lastTimeStr);
    const lagSeconds = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / 1000));
    const status = lagSeconds > maxLagAllowed ? 'lagging' : 'healthy';

    return {
      entity,
      lastUpdatedAt: lastDate.toISOString(),
      lagSeconds,
      status
    };
  }
}
