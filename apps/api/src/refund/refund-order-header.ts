/** Consolidated refund module. */
import { beijingDayRangeUtc, shiftDateKey } from '@content/shared';
import { rateAgainstGmv, SQL_GMV_OH } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import type { RefundTodayPayload, RefundTrendPoint, RefundVerifyTodayPayload } from './refund.dto';

// --- refund-order-header-day-gmv.ts ---
export function dayIsoRange(date: string) {
  const { start: dayStart, end: dayEnd } = beijingDayRangeUtc(date);
  return { startIso: dayStart.toISOString(), endIso: dayEnd.toISOString() };
}
export async function loadOrderHeaderDayGmv(prisma: PrismaService, date: string) {
  const { startIso, endIso } = dayIsoRange(date);
  const dayRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv", COUNT(CASE WHEN "paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" WHERE "paidTime" >= ? AND "paidTime" < ?`,
    startIso,
    endIso
  )) as Array<{ totalGmv: number; paidOrderCount: number }>;
  return {
    totalGmv: Number(dayRows[0]?.totalGmv ?? 0),
    paidOrderCount: Number(dayRows[0]?.paidOrderCount ?? 0)
  };
}

// --- refund-order-header-day-events.ts ---
export async function loadOrderHeaderRefundTotals(prisma: PrismaService, date: string) {
  const { startIso, endIso } = dayIsoRange(date);
  const refundRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("refundAmount"), 0) AS "totalRefund", COUNT(*) AS "refundCount" FROM "OrderHeader" WHERE "refundTime" >= ? AND "refundTime" < ? AND "refundAmount" > 0`,
    startIso,
    endIso
  )) as Array<{ totalRefund: number; refundCount: number }>;
  const r = refundRows[0] ?? { totalRefund: 0, refundCount: 0 };
  return { totalRefund: Number(r.totalRefund), refundCount: Number(r.refundCount) };
}
export async function loadOrderHeaderVerifyTotals(prisma: PrismaService, date: string) {
  const { startIso, endIso } = dayIsoRange(date);
  const verifyRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("verifyAmount"), 0) AS "totalVerify", COUNT(*) AS "verifyCount" FROM "OrderHeader" WHERE "verifyTime" >= ? AND "verifyTime" < ? AND "verifyAmount" > 0`,
    startIso,
    endIso
  )) as Array<{ totalVerify: number; verifyCount: number }>;
  const r = verifyRows[0] ?? { totalVerify: 0, verifyCount: 0 };
  return { totalVerify: Number(r.totalVerify), verifyCount: Number(r.verifyCount) };
}

// --- refund-order-merchants-query.ts ---
export type MerchantMetricRow = {
  merchantId: string;
  merchantName: string;
  gmv: number;
  refund?: number;
  verify?: number;
};
export async function queryTopMerchantsByMetric(
  prisma: PrismaService,
  date: string,
  limit: number,
  opts: {
    timeColumn: 'refundTime' | 'verifyTime';
    amountColumn: 'refundAmount' | 'verifyAmount';
    amountAlias: 'refund' | 'verify';
  }
): Promise<MerchantMetricRow[]> {
  const { start: dayStart, end: dayEnd } = beijingDayRangeUtc(date);
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(oh."merchantName", ''), oh."merchantId") AS "merchantName", oh."merchantId", COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv", COALESCE(SUM(oh."${opts.amountColumn}"), 0) AS "${opts.amountAlias}" FROM "OrderHeader" oh WHERE oh."${opts.timeColumn}" >= ? AND oh."${opts.timeColumn}" < ? AND oh."${opts.amountColumn}" > 0 AND oh."merchantId" IS NOT NULL GROUP BY oh."merchantId" ORDER BY "${opts.amountAlias}" DESC LIMIT ?`,
    dayStart.toISOString(),
    dayEnd.toISOString(),
    limit
  )) as MerchantMetricRow[];
}

// --- refund-order-merchants.ts ---
export async function topRefundMerchants(prisma: PrismaService, date: string, limit: number) {
  const rows = await queryTopMerchantsByMetric(prisma, date, limit, {
    timeColumn: 'refundTime',
    amountColumn: 'refundAmount',
    amountAlias: 'refund'
  });
  return rows.map((r) => {
    const refund = Number(r.refund ?? 0);
    const gmv = Number(r.gmv);
    return {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      gmv,
      refund,
      refundRate: rateAgainstGmv(refund, gmv)
    };
  });
}
export async function topVerifyMerchants(prisma: PrismaService, date: string, limit: number) {
  const rows = await queryTopMerchantsByMetric(prisma, date, limit, {
    timeColumn: 'verifyTime',
    amountColumn: 'verifyAmount',
    amountAlias: 'verify'
  });
  return rows.map((r) => {
    const verify = Number(r.verify ?? 0);
    const gmv = Number(r.gmv);
    return {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      gmv,
      verify,
      verifyRate: rateAgainstGmv(verify, gmv)
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
  const { totalGmv, paidOrderCount } = await loadOrderHeaderDayGmv(prisma, date),
    { totalRefund, refundCount } = await loadOrderHeaderRefundTotals(prisma, date);
  return {
    date,
    totalRefund,
    totalGmv,
    refundRate: rateAgainstGmv(totalRefund, totalGmv),
    refundCount,
    paidOrderCount,
    topRefundMerchants: await topRefundMerchants(date, 5),
    updatedAt: new Date().toISOString()
  };
}
export async function computeVerifyFromOrderHeader(
  prisma: PrismaService,
  date: string,
  topVerifyMerchants: TopVerifyFn
): Promise<RefundVerifyTodayPayload> {
  const { totalGmv, paidOrderCount } = await loadOrderHeaderDayGmv(prisma, date),
    { totalVerify, verifyCount } = await loadOrderHeaderVerifyTotals(prisma, date);
  return {
    date,
    totalVerify,
    totalGmv,
    verifyRate: rateAgainstGmv(totalVerify, totalGmv),
    verifyCount,
    paidOrderCount,
    topVerifyMerchants: await topVerifyMerchants(date, 5),
    updatedAt: new Date().toISOString()
  };
}

// --- refund-order-header-trend-fill.ts ---
type TrendRow = { date: string; totalRefund: number; refundCount: number; paidOrderCount: number };
export async function queryRefundTrendRows(
  prisma: PrismaService,
  startIso: string,
  endIso: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT date("refundTime", '+8 hours') AS "date", COALESCE(SUM("refundAmount"), 0) AS "totalRefund", COUNT(*) AS "refundCount", COUNT(CASE WHEN "paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" WHERE "refundTime" >= ? AND "refundTime" < ? AND "refundAmount" > 0 GROUP BY date("refundTime", '+8 hours') ORDER BY "date" ASC`,
    startIso,
    endIso
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
      totalRefund: Number(r?.totalRefund ?? 0),
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
  const startIso = beijingDayRangeUtc(startDate).start.toISOString(),
    endIso = beijingDayRangeUtc(endDate).end.toISOString();
  const rows = await queryRefundTrendRows(prisma, startIso, endIso);
  const days =
    Math.round(
      (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000
    ) + 1;
  return fillRefundTrendDays(rows, startDate, days);
}
