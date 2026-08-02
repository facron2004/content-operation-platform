/** Consolidated refund module. */
import { shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  rateAgainstGmv,
  SQL_GMV_OH,
  sqlBeijingDate,
  sqlDatetimeExclusiveRange
} from '../common';
import { PrismaService } from '../prisma/prisma.service';
import type { RefundTodayPayload, RefundTrendPoint, RefundVerifyTodayPayload } from './refund.dto';

// --- refund-order-header-day-gmv.ts ---
/** Exclusive half-open Beijing day bounds as SQLite space-form params. */
export function dayIsoRange(date: string) {
  const { start, end } = beijingDayRangeSqlite(date);
  // Keep property names for call-site compatibility; values are space form.
  return { startIso: start, endIso: end };
}
export async function loadOrderHeaderDayGmv(prisma: PrismaService, date: string) {
  const { startIso, endIso } = dayIsoRange(date);
  const dayRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen", COUNT(CASE WHEN "paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startIso,
    endIso
  )) as Array<{ totalGmvFen: bigint | null; paidOrderCount: number }>;
  return {
    totalGmvFen: BigInt(Number(dayRows[0]?.totalGmvFen ?? 0)),
    paidOrderCount: Number(dayRows[0]?.paidOrderCount ?? 0)
  };
}

// --- refund-order-header-day-events.ts ---
export async function loadOrderHeaderRefundTotals(prisma: PrismaService, date: string) {
  const { startIso, endIso } = dayIsoRange(date);
  const refundRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("refundAmountFen"), 0) AS "totalRefundFen", COUNT(*) AS "refundCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} AND "refundAmountFen" > 0`,
    startIso,
    endIso
  )) as Array<{ totalRefundFen: bigint | null; refundCount: number }>;
  const r = refundRows[0] ?? { totalRefundFen: 0, refundCount: 0 };
  return { totalRefundFen: BigInt(Number(r.totalRefundFen)), refundCount: Number(r.refundCount) };
}
export async function loadOrderHeaderVerifyTotals(prisma: PrismaService, date: string) {
  const { startIso, endIso } = dayIsoRange(date);
  const verifyRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("verifyAmountFen"), 0) AS "totalVerifyFen", COUNT(*) AS "verifyCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"verifyTime"')} AND "verifyAmountFen" > 0`,
    startIso,
    endIso
  )) as Array<{ totalVerifyFen: bigint | null; verifyCount: number }>;
  const r = verifyRows[0] ?? { totalVerifyFen: 0, verifyCount: 0 };
  return { totalVerifyFen: BigInt(Number(r.totalVerifyFen)), verifyCount: Number(r.verifyCount) };
}

// --- refund-order-merchants-query.ts ---
export type MerchantMetricRow = {
  merchantId: string;
  merchantName: string;
  gmvFen: bigint | null;
  refundFen?: bigint | null;
  verifyFen?: bigint | null;
};
export async function queryTopMerchantsByMetric(
  prisma: PrismaService,
  date: string,
  limit: number,
  opts: {
    timeColumn: 'paidTime' | 'orderTime' | 'verifyTime';
    amountColumn: 'refundAmountFen' | 'verifyAmountFen';
    amountAlias: 'refundFen' | 'verifyFen';
  }
): Promise<MerchantMetricRow[]> {
  const { start, end } = beijingDayRangeSqlite(date);
  // timeColumn is a closed enum — safe to interpolate as an identifier.
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(oh."merchantName", ''), oh."merchantId") AS "merchantName", oh."merchantId", COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen", COALESCE(SUM(oh."${opts.amountColumn}"), 0) AS "${opts.amountAlias}" FROM "OrderHeader" oh WHERE ${sqlDatetimeExclusiveRange(`oh."${opts.timeColumn}"`)} AND oh."${opts.amountColumn}" > 0 AND oh."merchantId" IS NOT NULL GROUP BY oh."merchantId" ORDER BY "${opts.amountAlias}" DESC LIMIT ?`,
    start,
    end,
    limit
  )) as MerchantMetricRow[];
}

// --- refund-order-merchants.ts ---
export async function topRefundMerchants(prisma: PrismaService, date: string, limit: number) {
  const rows = await queryTopMerchantsByMetric(prisma, date, limit, {
    timeColumn: 'paidTime',
    amountColumn: 'refundAmountFen',
    amountAlias: 'refundFen'
  });
  return rows.map((r) => {
    const gmv = Number(r.gmvFen ?? 0) / 100;
    const refund = Number(r.refundFen ?? 0) / 100;
    return {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      gmv,
      refund,
      refundRate: rateAgainstGmv(refund, gmv)
    };
  });
}

// --- refund-order-header-today.ts ---
type TopRefundFn = (
  date: string,
  limit: number
) => Promise<RefundTodayPayload['topRefundMerchants']>;
type TopVerifyFn = (
  date: string,
  limit: number
) => Promise<RefundVerifyTodayPayload['topVerifyMerchants']>;
export async function computeRefundFromOrderHeader(
  prisma: PrismaService,
  date: string,
  topRefundMerchants: TopRefundFn
): Promise<RefundTodayPayload> {
  const { totalGmvFen, paidOrderCount } = await loadOrderHeaderDayGmv(prisma, date),
    { totalRefundFen, refundCount } = await loadOrderHeaderRefundTotals(prisma, date);
  return {
    date,
    totalRefund: Number(totalRefundFen) / 100,
    totalGmv: Number(totalGmvFen) / 100,
    refundRate: rateAgainstGmv(Number(totalRefundFen) / 100, Number(totalGmvFen) / 100),
    refundCount,
    paidOrderCount,
    topRefundMerchants: await topRefundMerchants(date, 5),
    updatedAt: new Date().toISOString()
  };
}
export async function topVerifyMerchants(prisma: PrismaService, date: string, limit: number) {
  const rows = await queryTopMerchantsByMetric(prisma, date, limit, {
    timeColumn: 'verifyTime',
    amountColumn: 'verifyAmountFen',
    amountAlias: 'verifyFen'
  });
  return rows.map((r) => {
    const gmv = Number(r.gmvFen ?? 0) / 100;
    const verify = Number(r.verifyFen ?? 0) / 100;
    return {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      gmv,
      verify,
      verifyRate: rateAgainstGmv(verify, gmv)
    };
  });
}
export async function computeVerifyFromOrderHeader(
  prisma: PrismaService,
  date: string,
  topVerifyMerchants: TopVerifyFn
): Promise<RefundVerifyTodayPayload> {
  const { totalGmvFen, paidOrderCount } = await loadOrderHeaderDayGmv(prisma, date),
    { totalVerifyFen, verifyCount } = await loadOrderHeaderVerifyTotals(prisma, date);
  return {
    date,
    totalVerify: Number(totalVerifyFen) / 100,
    totalGmv: Number(totalGmvFen) / 100,
    verifyRate: rateAgainstGmv(Number(totalVerifyFen) / 100, Number(totalGmvFen) / 100),
    verifyCount,
    paidOrderCount,
    topVerifyMerchants: await topVerifyMerchants(date, 5),
    updatedAt: new Date().toISOString()
  };
}

// --- refund-order-header-trend-fill.ts ---
type TrendRow = {
  date: string;
  totalRefundFen: bigint | null;
  refundCount: number;
  paidOrderCount: number;
};
export async function queryRefundTrendRows(
  prisma: PrismaService,
  startBound: string,
  endBound: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT ${sqlBeijingDate('"paidTime"')} AS "date", COALESCE(SUM("refundAmountFen"), 0) AS "totalRefundFen", COUNT(*) AS "refundCount", COUNT(CASE WHEN "paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} AND "refundAmountFen" > 0 GROUP BY ${sqlBeijingDate('"paidTime"')} ORDER BY "date" ASC`,
    startBound,
    endBound
  )) as TrendRow[];
}
export function fillRefundTrendDays(
  rows: TrendRow[],
  startDate: string,
  days: number
): RefundTrendPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r])),
    result: RefundTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(startDate, i),
      r = byDate.get(d);
    result.push({
      date: d,
      totalRefund: Number(r?.totalRefundFen ?? 0) / 100,
      refundRate: 0,
      refundCount: Number(r?.refundCount ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0)
    });
  }
  return result;
}

// --- refund-order-header-trend.ts ---
export async function computeRefundTrendFromOrderHeader(
  prisma: PrismaService,
  startDate: string,
  endDate: string
): Promise<RefundTrendPoint[]> {
  const startBound = beijingDayRangeSqlite(startDate).start;
  const endBound = beijingDayRangeSqlite(endDate).end;
  const rows = await queryRefundTrendRows(prisma, startBound, endBound);
  const days =
    Math.round(
      (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000
    ) + 1;
  return fillRefundTrendDays(rows, startDate, days);
}
