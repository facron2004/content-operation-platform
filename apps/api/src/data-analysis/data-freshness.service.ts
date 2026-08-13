import { Injectable, Inject } from '@nestjs/common';
import { sqlDatetime } from '../common';
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
      `SELECT MAX(${sqlDatetime('"computedAt"')}) as maxTime FROM "TaskPerformanceDaily"`
    );
    const attrRows = await this.prisma.$queryRawUnsafe<[{ maxTime: string | null }]>(
      `SELECT MAX(${sqlDatetime('"attributedAt"')}) as maxTime FROM "OrderAttribution"`
    );
    const mdmRows = await this.prisma.$queryRawUnsafe<[{ maxTime: string | null }]>(
      `SELECT MAX(${sqlDatetime('"updatedAt"')}) as maxTime FROM "MerchantDailyMetrics"`
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
    // SQLite datetime() emits a UTC space-form value without a zone suffix.
    // `new Date('YYYY-MM-DD HH:mm:ss')` is interpreted in the process timezone
    // (Asia/Shanghai in production), which used to make every lag eight hours
    // too large and could report healthy data as lagging.
    const normalized = lastTimeStr.trim().replace(' ', 'T');
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const lastDate = new Date(hasZone ? normalized : `${normalized}Z`);
    if (Number.isNaN(lastDate.getTime())) {
      return { entity, lastUpdatedAt: null, lagSeconds: null, status: 'unknown' };
    }
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
