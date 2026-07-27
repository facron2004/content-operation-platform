/** Consolidated refund module — OH primary, DM secondary, never SalesSnapshot. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { ConflictException } from '@nestjs/common';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { isBeijingToday } from '../money';
import { PrismaService } from '../prisma/prisma.service';
import {
  refundTodayFromDailyMetrics,
  refundTrendFromDailyMetrics,
  verifyTodayFromDailyMetrics,
  verifyTrendFromDailyMetrics
} from './refund-daily-metrics';
import {
  computeRefundFromOrderHeader,
  computeRefundTrendFromOrderHeader,
  computeVerifyFromOrderHeader,
  topRefundMerchants,
  topVerifyMerchants
} from './refund-order-header';
import { pageTopMerchants, queryAllTopMerchants } from './refund-top-merchants';
import {
  type RefundTodayPayload,
  RefundTopMerchantsQueryDto,
  type RefundTrendPoint,
  type RefundVerifyTodayPayload,
  type VerifyTrendPoint
} from './refund.dto';

export async function resolveWithCacheFallback<T>(o: {
  cache: TtlCache;
  cacheKey: string;
  primary: () => Promise<T | null | undefined>;
  secondary?: () => Promise<T | null | undefined>;
  acceptPrimary?: (v: T) => boolean;
  acceptSecondary?: (v: T) => boolean;
}): Promise<T> {
  // Single-flight via getOrLoad — concurrent cold hits must not re-run OH/DM SQL.
  // Cold path also shares the process-wide heavy aggregate pool (parity GMV).
  try {
    return await o.cache.getOrLoad(o.cacheKey, false, () =>
      withHeavyAggregateGate(async () => {
        const primary = await o.primary();
        if (primary != null && (o.acceptPrimary?.(primary) ?? true)) {
          return primary;
        }

        if (o.secondary) {
          const secondary = await o.secondary();
          if (secondary != null && (o.acceptSecondary?.(secondary) ?? true)) {
            return secondary;
          }
        }

        // No SalesSnapshot fallback: return primary even if "empty" (truthful zeros).
        if (primary != null) {
          return primary;
        }

        throw new Error(`Money resolve produced no payload for cache key ${o.cacheKey}`);
      })
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
      throw new ConflictException('退款核销计算繁忙，请稍后再试');
    }
    throw err;
  }
}

export type RefundPrisma = PrismaService;

export function loadRefundToday(
  prisma: PrismaService,
  cache: TtlCache,
  date?: string
): Promise<RefundTodayPayload> {
  const target = date ?? beijingDateKey(new Date());
  const preferOh = isBeijingToday(target);
  return resolveWithCacheFallback({
    cache,
    cacheKey: `refundToday:${date ?? 'today'}`,
    primary: () =>
      computeRefundFromOrderHeader(prisma, target, (d, n) => topRefundMerchants(prisma, d, n)),
    // Today: always accept OH (including zeros). History: accept if non-empty else try DM.
    acceptPrimary: preferOh ? () => true : (oh) => oh.paidOrderCount > 0 || oh.totalRefund > 0,
    secondary: preferOh ? undefined : () => refundTodayFromDailyMetrics(prisma, target)
  });
}

export function loadRefundTrend(
  prisma: PrismaService,
  cache: TtlCache,
  days: 7 | 30,
  endDate?: string
): Promise<RefundTrendPoint[]> {
  const end = endDate ?? beijingDateKey(new Date());
  const start = shiftDateKey(end, -(days - 1));
  return resolveWithCacheFallback({
    cache,
    cacheKey: `refundTrend:${days}:${endDate ?? 'today'}`,
    primary: () => computeRefundTrendFromOrderHeader(prisma, start, end),
    acceptPrimary: (rows) => rows.some((r) => r.paidOrderCount > 0 || r.totalRefund > 0),
    secondary: () => refundTrendFromDailyMetrics(prisma, start, days)
  });
}

export function loadVerifyToday(
  prisma: PrismaService,
  cache: TtlCache,
  date?: string
): Promise<RefundVerifyTodayPayload> {
  const target = date ?? beijingDateKey(new Date());
  const preferOh = isBeijingToday(target);
  return resolveWithCacheFallback({
    cache,
    cacheKey: `verifyToday:${date ?? 'today'}`,
    primary: () =>
      computeVerifyFromOrderHeader(prisma, target, (d, n) => topVerifyMerchants(prisma, d, n)),
    acceptPrimary: preferOh ? () => true : (oh) => oh.paidOrderCount > 0 || oh.totalVerify > 0,
    secondary: preferOh ? undefined : () => verifyTodayFromDailyMetrics(prisma, target)
  });
}

export function loadVerifyTrend(
  prisma: PrismaService,
  cache: TtlCache,
  days: 7 | 30,
  endDate?: string
): Promise<VerifyTrendPoint[]> {
  const end = endDate ?? beijingDateKey(new Date());
  const start = shiftDateKey(end, -(days - 1));
  return resolveWithCacheFallback({
    cache,
    cacheKey: `verifyTrend:${days}:${endDate ?? 'today'}`,
    // Prefer DM for verify trend history when present; else OH is not wired as primary series —
    // fall back to DM then empty-safe path via primary-only OH day rebuild is out of scope.
    primary: () => verifyTrendFromDailyMetrics(prisma, start, days),
    acceptPrimary: (rows) => rows.some((r) => r.paidOrderCount > 0 || r.totalVerify > 0),
    secondary: async () => {
      // No SS: return calendar zeros from DM helper empty fill by reusing DM path with empty table
      // already handled inside verifyTrendFromDailyMetrics; force OH-less empty series:
      const points: VerifyTrendPoint[] = [];
      for (let i = 0; i < days; i++) {
        const d = shiftDateKey(start, i);
        points.push({
          date: d,
          totalVerify: 0,
          verifyRate: 0,
          verifyCount: 0,
          paidOrderCount: 0
        });
      }
      return points;
    }
  });
}

export function createRefundServiceSurface(prisma: PrismaService, cache: TtlCache) {
  return {
    getRefundToday: (date?: string) => loadRefundToday(prisma, cache, date),
    getRefundTrend: (days: 7 | 30, endDate?: string) =>
      loadRefundTrend(prisma, cache, days, endDate),
    getVerifyToday: (date?: string) => loadVerifyToday(prisma, cache, date),
    getVerifyTrend: (days: 7 | 30, endDate?: string) =>
      loadVerifyTrend(prisma, cache, days, endDate),
    getTopMerchants: async (q: RefundTopMerchantsQueryDto) => {
      // Page-less aggregate key — page flips share one sorted list (parity GMV / merchant-sales).
      const all = await resolveWithCacheFallback({
        cache,
        cacheKey: `refundTopMerchants:${q.sortBy}`,
        primary: () => queryAllTopMerchants(prisma, q.sortBy),
        acceptPrimary: () => true
      });
      return pageTopMerchants(all, q.page, q.pageSize);
    }
  };
}
