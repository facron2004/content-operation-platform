/** Consolidated GMV module — money resolve: OH today, DM history, never SalesSnapshot. */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { netGmvParts, rateByCount, SQL_GMV_SS, toFenBigInt } from '../common';
import { GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import { shouldPreferOrderHeaderForKpi } from '../money';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapDailyMetricsToKpi,
  mapDailyMetricsTrend,
  pageMerchants,
  sortMerchants
} from './gmv-metrics';
import {
  computeDistributionFromOrderHeader,
  computeFromOrderHeader,
  computeHourlyFromOrderHeader,
  computeTrendFromOrderHeader
} from './gmv-order-header';
import { aggregateTrend } from './gmv-trend-aggregate';
export { aggregateTrend } from './gmv-trend-aggregate';
import {
  type GmvDistributionDim,
  type GmvDistributionPayload,
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
 * History: prefer DailyMetrics row, else OrderHeader for the same date.
 * Never redirect to another date — showing yesterday's data as today is worse than zeros.
 * Never SalesSnapshot.
 */
export async function resolveGmvKpis(prisma: PrismaLike, date?: string): Promise<GmvTodayPayload> {
  const targetDate = date ?? beijingDateKey(new Date());

  // Today always uses OrderHeader — no fallback to yesterday.
  if (shouldPreferOrderHeaderForKpi(targetDate)) {
    return computeFromOrderHeader(prisma, targetDate);
  }

  // History: prefer DailyMetrics, else OrderHeader.
  const kpiSelect = {
    date: true,
    totalGmvFen: true,
    gmvOnlineFen: true,
    gmvWalletFen: true,
    gmvBonusFen: true,
    gmvCardFen: true,
    totalRefundFen: true,
    refundRate: true,
    refundCount: true,
    verifyCount: true,
    totalVerifyFen: true,
    verifyRate: true,
    paidOrderCount: true,
    paidAmountBonusFen: true,
    paidAmountWalletFen: true,
    updatedAt: true
  } as const;

  const dmRow = await prisma.dailyMetrics.findUnique({
    where: { date: targetDate },
    select: kpiSelect
  });
  if (dmRow) {
    const prevDate = shiftDateKey(targetDate, -1);
    const monthStart = `${targetDate.slice(0, 7)}-01`;
    const [prevDm, monthRows] = await Promise.all([
      prisma.dailyMetrics.findUnique({ where: { date: prevDate }, select: kpiSelect }),
      prisma.dailyMetrics.findMany({
        where: { date: { gte: monthStart, lte: targetDate } },
        select: { totalGmvFen: true, totalRefundFen: true, gmvOnlineFen: true, gmvWalletFen: true }
      })
    ]);

    const monthGmvFen = monthRows.reduce(
      (sum, row) => sum + (toFenBigInt(row.totalGmvFen) - toFenBigInt(row.totalRefundFen)),
      0n
    );
    const monthGrossOnlineFen = monthRows.reduce(
      (sum, row) => sum + toFenBigInt(row.gmvOnlineFen),
      0n
    );
    const monthGrossWalletFen = monthRows.reduce(
      (sum, row) => sum + toFenBigInt(row.gmvWalletFen),
      0n
    );
    const monthRefundFen = monthRows.reduce(
      (sum, row) => sum + toFenBigInt(row.totalRefundFen),
      0n
    );
    const monthParts = netGmvParts(monthGrossOnlineFen, monthGrossWalletFen, monthRefundFen);
    return mapDailyMetricsToKpi(dmRow, {
      monthGmvFen,
      monthGmvOnlineFen: monthParts.onlineFen,
      monthGmvWalletFen: monthParts.walletFen,
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
  let end = endDate;
  if (!end) {
    const latestActive = await prisma.dailyMetrics.findFirst({
      where: { paidOrderCount: { gt: 0 } },
      orderBy: { date: 'desc' },
      select: { date: true }
    });
    end = latestActive?.date ?? beijingDateKey(new Date());
  }
  // Cap interactive fan-out at 90d even when week/month floors push dayCount up.
  // Month used to floor at 365 (full-year OH fallback when DailyMetrics empty).
  const INTERACTIVE_TREND_MAX_DAYS = 90;
  const rawDayCount =
    granularity === 'day' ? days : granularity === 'week' ? Math.max(days, 84) : Math.max(days, 90);
  const dayCount = Math.min(rawDayCount, INTERACTIVE_TREND_MAX_DAYS);
  const start = shiftDateKey(end, -(dayCount - 1));

  // Explicit columns for mapDailyMetricsTrend — never SELECT * full DailyMetrics row.
  const dmRows = await prisma.dailyMetrics.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      totalGmvFen: true,
      gmvOnlineFen: true,
      gmvWalletFen: true,
      gmvBonusFen: true,
      totalRefundFen: true,
      totalVerifyFen: true,
      refundRate: true,
      verifyRate: true,
      refundCount: true,
      verifyCount: true,
      paidOrderCount: true
    }
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
  let targetDate = date;
  if (!targetDate) {
    const latestActive = await prisma.dailyMetrics.findFirst({
      where: { paidOrderCount: { gt: 0 } },
      orderBy: { date: 'desc' },
      select: { date: true }
    });
    targetDate = latestActive?.date ?? beijingDateKey(new Date());
  }
  // A database failure must reach the service/controller. Returning 24 zero
  // points makes an unavailable read look like a valid zero-sales day.
  return computeHourlyFromOrderHeader(prisma, targetDate);
}

export async function resolveGmvDistribution(
  prisma: PrismaLike,
  dim: GmvDistributionDim,
  limit: number
): Promise<GmvDistributionPayload> {
  return computeDistributionFromOrderHeader(prisma, dim, limit);
}

// --- MerchantDailyMetrics top merchants (reuses pre-aggregated data) ---
export async function computeMerchantsFromMdMetrics(prisma: PrismaLike): Promise<GmvMerchantRow[]> {
  const todayStr = beijingDateKey(new Date());
  const weekAgoStr = beijingDateKey(Date.now() - 6 * 86400000);
  // Cap materialization — page DTO Max(100)×pageSize Max(100) never needs full set.
  // Sort by gmv DESC in SQL so top-N is correct for the default sort; non-gmv sorts
  // re-sort the capped set in memory (still bounded).
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "merchantName", MAX("areaName") AS "areaName",
     COALESCE(SUM(${SQL_GMV_SS}), 0) AS "gmv",
     COALESCE(SUM(${SQL_GMV_SS}), 0) AS "gmvFen",
     COALESCE(SUM("refundAmountFen"), 0) AS "gmvRefundFen",
     COALESCE(SUM("verifyAmountFen"), 0) AS "gmvVerifyFen",
     COALESCE(SUM("paidOrderCount"), 0) AS "paidOrderCount",
     COALESCE(SUM("refundCount"), 0) AS "refundCount",
     COALESCE(SUM("verifyCount"), 0) AS "verifyCount"
     FROM "MerchantDailyMetrics"
     WHERE "date" >= ? AND "date" <= ?
     GROUP BY "merchantName"
     ORDER BY "gmv" DESC
     LIMIT ?`,
    weekAgoStr,
    todayStr,
    GMV_TOP_MERCHANTS_LIMIT
  )) as Array<{
    merchantName: string;
    areaName: string | null;
    gmvFen: bigint | null;
    gmvRefundFen: bigint | null;
    gmvVerifyFen: bigint | null;
    paidOrderCount: number;
    refundCount: number;
    verifyCount: number;
  }>;
  return rows.map((r) => {
    const gmvFen = toFenBigInt(r.gmvFen);
    const gmvRefundFen = toFenBigInt(r.gmvRefundFen);
    const gmvVerifyFen = toFenBigInt(r.gmvVerifyFen);
    const paidOrderCount = Number(r.paidOrderCount);
    return {
      merchantId: r.merchantName,
      merchantName: r.merchantName,
      areaName: r.areaName,
      gmvFen,
      gmvRefundFen,
      gmvVerifyFen,
      // 单数口径: 退款/核销率 = 单数 / 支付单数.
      refundRate: rateByCount(Number(r.refundCount), paidOrderCount),
      verifyRate: rateByCount(Number(r.verifyCount), paidOrderCount),
      paidOrderCount
    };
  });
}

/** Full sorted merchant aggregate (no page) — cache across page flips. */
export async function computeGmvTopMerchants(
  prisma: PrismaLike,
  sortBy: GmvMerchantSort
): Promise<GmvMerchantRow[]> {
  const merchants = await computeMerchantsFromMdMetrics(prisma);
  return sortMerchants(merchants, sortBy);
}

export async function resolveGmvTopMerchants(
  prisma: PrismaLike,
  sortBy: GmvMerchantSort,
  page: number,
  pageSize: number
): Promise<{
  items: GmvMerchantRow[];
  hasMore: boolean;
  limit: number;
  truncated: boolean;
}> {
  const sorted = await computeGmvTopMerchants(prisma, sortBy);
  return pageMerchants(sorted, page, pageSize);
}
