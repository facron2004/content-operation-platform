/** Consolidated GMV module — money resolve: OH today, DM history, never SalesSnapshot. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { rateAgainstGmv } from '../common';
import { shouldPreferOrderHeaderForKpi } from '../money';
import { PrismaService } from '../prisma/prisma.service';
import { mapDailyMetricsToKpi, mapDailyMetricsTrend, sortAndPageMerchants } from './gmv-metrics';
import {
  computeDistributionFromOrderHeader,
  computeFromOrderHeader,
  computeHourlyFromOrderHeader,
  computeTrendFromOrderHeader
} from './gmv-order-header';
import {
  emptyHourlyPoints,
  type GmvDistributionDim,
  type GmvDistributionRow,
  type GmvHourlyPoint,
  type GmvMerchantRow,
  type GmvMerchantSort,
  type GmvTodayPayload,
  type GmvTrendPoint,
  type TrendGranularity,
  type TrendWindow
} from './gmv.dto';

type PrismaLike = Pick<
  PrismaService,
  '$queryRawUnsafe' | 'contentPackage' | 'dailyMetrics' | 'orderHeader'
>;

/**
 * Today: always OrderHeader (even if zeros).
 * History: prefer DailyMetrics row, else OrderHeader.
 * Never SalesSnapshot.
 */
export async function resolveGmvKpis(prisma: PrismaLike, date?: string): Promise<GmvTodayPayload> {
  const targetDate = date ?? beijingDateKey(new Date());

  if (shouldPreferOrderHeaderForKpi(targetDate)) {
    return computeFromOrderHeader(prisma, targetDate);
  }

  const prevDate = shiftDateKey(targetDate, -1);
  const monthStart = `${targetDate.slice(0, 7)}-01`;
  const [dmRow, prevDm, monthRows] = await Promise.all([
    prisma.dailyMetrics.findUnique({ where: { date: targetDate } }),
    prisma.dailyMetrics.findUnique({ where: { date: prevDate } }),
    prisma.dailyMetrics.findMany({
      where: { date: { gte: monthStart, lte: targetDate } },
      select: { totalGmv: true, gmvOnline: true, gmvWallet: true }
    })
  ]);

  if (dmRow) {
    const monthGmv = monthRows.reduce((sum, row) => sum + Number(row.totalGmv), 0);
    const monthGmvOnline = monthRows.reduce((sum, row) => sum + Number(row.gmvOnline ?? 0), 0);
    const monthGmvWallet = monthRows.reduce((sum, row) => sum + Number(row.gmvWallet ?? 0), 0);
    return mapDailyMetricsToKpi(dmRow, {
      monthGmv,
      monthGmvOnline,
      monthGmvWallet,
      prev: prevDm
    });
  }

  return computeFromOrderHeader(prisma, targetDate);
}

export async function resolveGmvTrend(
  prisma: PrismaLike,
  days: TrendWindow,
  endDate?: string,
  granularity: TrendGranularity = 'day'
): Promise<GmvTrendPoint[]> {
  const end = endDate ?? beijingDateKey(new Date());
  const dayCount =
    granularity === 'day'
      ? days
      : granularity === 'week'
        ? Math.max(days, 84)
        : Math.max(days, 365);
  const start = shiftDateKey(end, -(dayCount - 1));

  const dmRows = await prisma.dailyMetrics.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' }
  });

  let daily: GmvTrendPoint[];
  if (dmRows.length) {
    daily = mapDailyMetricsTrend(dmRows, start, dayCount);
  } else {
    daily = await computeTrendFromOrderHeader(prisma, start, end);
  }

  if (granularity === 'day') {
    return daily.slice(-days);
  }
  return aggregateTrend(daily, granularity);
}

export async function resolveGmvHourly(
  prisma: PrismaLike,
  date?: string
): Promise<GmvHourlyPoint[]> {
  const targetDate = date ?? beijingDateKey(new Date());
  try {
    return await computeHourlyFromOrderHeader(prisma, targetDate);
  } catch {
    return emptyHourlyPoints();
  }
}

function aggregateTrend(daily: GmvTrendPoint[], granularity: 'week' | 'month'): GmvTrendPoint[] {
  const buckets = new Map<string, GmvTrendPoint & { _count: number }>();
  for (const point of daily) {
    const key = granularity === 'week' ? weekKey(point.date) : point.date.slice(0, 7);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        date: key,
        totalGmv: point.totalGmv,
        gmvOnline: point.gmvOnline,
        gmvWallet: point.gmvWallet,
        gmvBonus: point.gmvBonus,
        totalRefund: point.totalRefund,
        refundRate: 0,
        verifyRate: 0,
        paidOrderCount: point.paidOrderCount,
        _count: 1
      });
      continue;
    }
    existing.totalGmv += point.totalGmv;
    existing.gmvOnline += point.gmvOnline;
    existing.gmvWallet += point.gmvWallet;
    existing.gmvBonus += point.gmvBonus;
    existing.totalRefund += point.totalRefund;
    existing.paidOrderCount += point.paidOrderCount;
    existing._count += 1;
  }

  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ _count, ...point }) => ({
      ...point,
      refundRate: point.totalGmv > 0 ? point.totalRefund / point.totalGmv : 0,
      verifyRate: 0
    }));
}

/** ISO week label YYYY-Www using Beijing date key */
function weekKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function resolveGmvDistribution(
  prisma: PrismaLike,
  dim: GmvDistributionDim,
  limit: number
): Promise<GmvDistributionRow[]> {
  return computeDistributionFromOrderHeader(prisma, dim, limit);
}

// --- MerchantDailyMetrics top merchants (reuses pre-aggregated data) ---
export async function computeMerchantsFromMdMetrics(prisma: PrismaLike): Promise<GmvMerchantRow[]> {
  const todayStr = beijingDateKey(new Date());
  const weekAgoStr = beijingDateKey(Date.now() - 6 * 86400000);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "merchantName", MAX("areaName") AS "areaName",
     COALESCE(SUM("paidAmountOnline" + "paidAmountWallet"), 0) AS "gmv",
     COALESCE(SUM("refundAmount"), 0) AS "gmvRefund",
     COALESCE(SUM("verifyAmount"), 0) AS "gmvVerify",
     COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount"
     FROM "MerchantDailyMetrics"
     WHERE "date" >= ? AND "date" <= ?
     GROUP BY "merchantName"
     ORDER BY "gmv" DESC`,
    weekAgoStr,
    todayStr
  )) as Array<{
    merchantName: string;
    areaName: string | null;
    gmv: number;
    gmvRefund: number;
    gmvVerify: number;
    paidOrderCount: number;
  }>;
  return rows.map((r) => ({
    merchantId: r.merchantName,
    merchantName: r.merchantName,
    areaName: r.areaName,
    gmv: Number(r.gmv),
    gmvRefund: Number(r.gmvRefund),
    gmvVerify: Number(r.gmvVerify),
    refundRate: rateAgainstGmv(Number(r.gmvRefund), Number(r.gmv)),
    verifyRate: rateAgainstGmv(Number(r.gmvVerify), Number(r.gmv)),
    paidOrderCount: Number(r.paidOrderCount)
  }));
}

export async function resolveGmvTopMerchants(
  prisma: PrismaLike,
  sortBy: GmvMerchantSort,
  page: number,
  pageSize: number
): Promise<{ items: GmvMerchantRow[]; hasMore: boolean }> {
  const merchants = await computeMerchantsFromMdMetrics(prisma);
  return sortAndPageMerchants(merchants, sortBy, page, pageSize);
}
