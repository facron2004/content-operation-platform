/** Consolidated refund module — OH primary, DM secondary, never SalesSnapshot. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { ConflictException } from '@nestjs/common';
import { rateByCount, TtlCache, withHeavyAggregateGate } from '../common';
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
  computeVerifyTrendFromOrderHeader,
  topRefundMerchants,
  topVerifyMerchants
} from './refund-order-header';
import { resolveRefundWindow } from './refund-top-merchants';
import { pageTopMerchants, queryAllTopMerchants } from './refund-top-merchants';
import {
  type RefundTodayPayload,
  type RefundTodayQueryDto,
  type RefundTopMerchantsQueryDto,
  type RefundTrendPoint,
  type RefundTrendQueryDto,
  type RefundVerifyTodayPayload,
  type TrendBucket,
  type VerifyTrendPoint
} from './refund.dto';

export async function resolveWithCacheFallback<T>(o: {
  cache: TtlCache;
  cacheKey: string;
  primary: () => Promise<T | null | undefined>;
  secondary?: () => Promise<T | null | undefined>;
  acceptPrimary?: (v: T) => boolean;
  acceptSecondary?: (v: T) => boolean;
  force?: boolean;
}): Promise<T> {
  try {
    return await o.cache.getOrLoad(o.cacheKey, o.force ?? false, () =>
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
        if (primary != null) return primary;
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

/** ISO week label YYYY-Www using Beijing date key (parity gmv-resolve weekKey). */
function weekKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function bucketKey(date: string, bucket: TrendBucket): string {
  if (bucket === 'day') return date;
  if (bucket === 'week') return weekKey(date);
  if (bucket === 'month') return date.slice(0, 7);
  return date.slice(0, 4);
}

/** Aggregate daily refund trend points into the requested bucket granularity. */
export function aggregateRefundTrendByBucket(
  points: RefundTrendPoint[],
  bucket: TrendBucket
): RefundTrendPoint[] {
  if (bucket === 'day') return points;
  const map = new Map<string, RefundTrendPoint & { _rc: number; _po: number }>();
  for (const p of points) {
    const key = bucketKey(p.date, bucket);
    const rc = Number(p.refundCount ?? 0);
    const po = Number(p.paidOrderCount ?? 0);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...p, date: key, refundRate: 0, _rc: rc, _po: po });
      continue;
    }
    cur.totalRefund += p.totalRefund;
    cur.refundCount = (cur.refundCount ?? 0) + rc;
    cur.paidOrderCount += po;
    cur._rc += rc;
    cur._po += po;
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ _rc, _po, ...p }) => ({
      ...p,
      // Unified 单数口径: 退款单数 / 支付单数.
      refundRate: rateByCount(_rc, _po)
    }));
}

/** Aggregate daily verify trend points into the requested bucket granularity. */
export function aggregateVerifyTrendByBucket(
  points: VerifyTrendPoint[],
  bucket: TrendBucket
): VerifyTrendPoint[] {
  if (bucket === 'day') return points;
  const map = new Map<string, VerifyTrendPoint & { _vc: number; _po: number }>();
  for (const p of points) {
    const key = bucketKey(p.date, bucket);
    const vc = Number(p.verifyCount ?? 0);
    const po = Number(p.paidOrderCount ?? 0);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...p, date: key, verifyRate: 0, _vc: vc, _po: po });
      continue;
    }
    cur.totalVerify += p.totalVerify;
    cur.verifyCount = (cur.verifyCount ?? 0) + vc;
    cur.paidOrderCount += po;
    cur._vc += vc;
    cur._po += po;
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ _vc, _po, ...p }) => ({
      ...p,
      // Unified 单数口径: 核销单数 / 支付单数.
      verifyRate: rateByCount(_vc, _po)
    }));
}

/** Day span (inclusive) to fetch for a given trend bucket. */
function bucketSpanDays(bucket: TrendBucket, days: number): number {
  if (bucket === 'day') return days;
  if (bucket === 'week') return 84; // ~12 weeks
  if (bucket === 'month') return 365; // ~12 months
  return 5 * 366; // ~5 years
}

export function loadRefundToday(
  prisma: PrismaService,
  cache: TtlCache,
  q: RefundTodayQueryDto,
  force = false
): Promise<RefundTodayPayload> {
  const target = q.date ?? beijingDateKey(new Date());
  const w = resolveRefundWindow(q.window ?? 'day', target);
  const preferOh = isBeijingToday(target);
  return resolveWithCacheFallback({
    cache,
    cacheKey: `refundToday:${q.window ?? 'day'}:${q.date ?? 'today'}`,
    force,
    primary: () =>
      computeRefundFromOrderHeader(prisma, w, (w2, n) => topRefundMerchants(prisma, w2, n)),
    // Today: always accept OH (including zeros). History: accept if non-empty else try DM.
    acceptPrimary: preferOh ? () => true : (oh) => oh.paidOrderCount > 0 || oh.totalRefund > 0,
    // DM secondary is single-day only; for non-day windows the OH primary is authoritative.
    secondary: preferOh ? undefined : () => refundTodayFromDailyMetrics(prisma, target)
  });
}

export function loadRefundTrend(
  prisma: PrismaService,
  cache: TtlCache,
  q: RefundTrendQueryDto,
  force = false
): Promise<RefundTrendPoint[]> {
  const end = q.endDate ?? beijingDateKey(new Date());
  const bucket = q.bucket ?? 'day';
  const spanDays = bucketSpanDays(bucket, q.days);
  const start = shiftDateKey(end, -(spanDays - 1));
  return resolveWithCacheFallback({
    cache,
    cacheKey: `refundTrend:${bucket}:${q.days}:${q.endDate ?? 'today'}`,
    force,
    primary: () => computeRefundTrendFromOrderHeader(prisma, start, end),
    acceptPrimary: (rows) => rows.some((r) => r.paidOrderCount > 0 || r.totalRefund > 0),
    secondary: () => refundTrendFromDailyMetrics(prisma, start, spanDays)
  }).then((rows) => aggregateRefundTrendByBucket(rows, bucket));
}

export function loadVerifyToday(
  prisma: PrismaService,
  cache: TtlCache,
  q: RefundTodayQueryDto,
  force = false
): Promise<RefundVerifyTodayPayload> {
  const target = q.date ?? beijingDateKey(new Date());
  const w = resolveRefundWindow(q.window ?? 'day', target);
  const preferOh = isBeijingToday(target);
  return resolveWithCacheFallback({
    cache,
    cacheKey: `verifyToday:${q.window ?? 'day'}:${q.date ?? 'today'}`,
    force,
    primary: () =>
      computeVerifyFromOrderHeader(prisma, w, (w2, n) => topVerifyMerchants(prisma, w2, n)),
    acceptPrimary: preferOh ? () => true : (oh) => oh.paidOrderCount > 0 || oh.totalVerify > 0,
    secondary: preferOh ? undefined : () => verifyTodayFromDailyMetrics(prisma, target)
  });
}

export function loadVerifyTrend(
  prisma: PrismaService,
  cache: TtlCache,
  q: RefundTrendQueryDto,
  force = false
): Promise<VerifyTrendPoint[]> {
  const end = q.endDate ?? beijingDateKey(new Date());
  const bucket = q.bucket ?? 'day';
  const spanDays = bucketSpanDays(bucket, q.days);
  const start = shiftDateKey(end, -(spanDays - 1));
  return resolveWithCacheFallback({
    cache,
    cacheKey: `verifyTrend:${bucket}:${q.days}:${q.endDate ?? 'today'}`,
    force,
    primary: () => computeVerifyTrendFromOrderHeader(prisma, start, end),
    acceptPrimary: (rows) => rows.some((r) => r.paidOrderCount > 0 || r.totalVerify > 0),
    secondary: () => verifyTrendFromDailyMetrics(prisma, start, spanDays)
  }).then((rows) => aggregateVerifyTrendByBucket(rows, bucket));
}

export function createRefundServiceSurface(prisma: PrismaService, cache: TtlCache) {
  return {
    getRefundToday: (q: RefundTodayQueryDto, force = false) =>
      loadRefundToday(prisma, cache, q, force),
    getRefundTrend: (q: RefundTrendQueryDto, force = false) =>
      loadRefundTrend(prisma, cache, q, force),
    getVerifyToday: (q: RefundTodayQueryDto, force = false) =>
      loadVerifyToday(prisma, cache, q, force),
    getVerifyTrend: (q: RefundTrendQueryDto, force = false) =>
      loadVerifyTrend(prisma, cache, q, force),
    getTopMerchants: async (q: RefundTopMerchantsQueryDto, force = false) => {
      const all = await resolveWithCacheFallback({
        cache,
        cacheKey: `refundTopMerchants:${q.sortBy}:${q.window ?? 'week'}:${q.date ?? 'today'}`,
        force,
        primary: () => queryAllTopMerchants(prisma, q.sortBy, q.window ?? 'week', q.date),
        acceptPrimary: () => true
      });
      return pageTopMerchants(all, q.page, q.pageSize);
    }
  };
}
