/** Consolidated refund module. */
import { shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  floorNonNegativeFen,
  rateByCount,
  SQL_GMV_OH,
  sqlBeijingDate,
  sqlDatetimeExclusiveRange,
  toFenBigInt
} from '../common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  RefundTodayPayload,
  RefundTrendPoint,
  RefundVerifyTodayPayload,
  VerifyTrendPoint
} from './refund.dto';

type Window = { start: string; end: string };

function bounds(w: Window): { startBound: string; endBound: string } {
  return {
    startBound: beijingDayRangeSqlite(w.start).start,
    endBound: beijingDayRangeSqlite(w.end).end
  };
}

// --- refund-order-header-range-gmv.ts ---
/** OrderHeader Net GMV + paid order count over a Beijing day range. */
export async function loadOrderHeaderRangeGmv(
  prisma: PrismaService,
  w: Window
): Promise<{ totalGmvFen: bigint; paidOrderCount: number }> {
  const { startBound, endBound } = bounds(w);
  const dayRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen", COUNT(CASE WHEN "paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalGmvFen: bigint | null; paidOrderCount: number }>;
  const r = dayRows[0] ?? { totalGmvFen: 0n, paidOrderCount: 0 };
  return {
    totalGmvFen: toFenBigInt(r.totalGmvFen),
    paidOrderCount: Number(r.paidOrderCount ?? 0)
  };
}

// --- refund-order-header-range-events.ts ---
export async function loadOrderHeaderRangeRefundTotals(
  prisma: PrismaService,
  w: Window
): Promise<{ totalRefundFen: bigint; refundCount: number }> {
  const { startBound, endBound } = bounds(w);
  const refundRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("refundAmountFen"), 0) AS "totalRefundFen", COUNT(CASE WHEN "refundAmountFen" > 0 THEN 1 END) AS "refundCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalRefundFen: bigint | null; refundCount: number }>;
  const r = refundRows[0] ?? { totalRefundFen: 0n, refundCount: 0 };
  return {
    totalRefundFen: toFenBigInt(r.totalRefundFen),
    refundCount: Number(r.refundCount ?? 0)
  };
}
export async function loadOrderHeaderRangeVerifyTotals(
  prisma: PrismaService,
  w: Window
): Promise<{ totalVerifyFen: bigint; verifyCount: number }> {
  const { startBound, endBound } = bounds(w);
  const verifyRows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(CASE WHEN "verifyTime" IS NOT NULL THEN "verifyAmountFen" ELSE 0 END), 0) AS "totalVerifyFen", COUNT(CASE WHEN "verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')}`,
    startBound,
    endBound
  )) as Array<{ totalVerifyFen: bigint | null; verifyCount: number }>;
  const r = verifyRows[0] ?? { totalVerifyFen: 0n, verifyCount: 0 };
  return {
    totalVerifyFen: toFenBigInt(r.totalVerifyFen),
    verifyCount: Number(r.verifyCount ?? 0)
  };
}

// --- refund-order-merchants-query.ts ---
export type MerchantMetricRow = {
  merchantId: string;
  merchantName: string;
  gmvFen: bigint | null;
  refundFen: bigint | null;
  verifyFen: bigint | null;
  refundCount: number;
  verifyCount: number;
  paidOrderCount: number;
};
export async function queryTopMerchantsByMetric(
  prisma: PrismaService,
  w: Window,
  limit: number,
  opts: {
    amountColumn: 'refundAmountFen' | 'verifyAmountFen';
    amountAlias: 'refundFen' | 'verifyFen';
  }
): Promise<MerchantMetricRow[]> {
  const { startBound, endBound } = bounds(w);
  // FIX: metric filter moved to HAVING so gmvFen + paidOrderCount aggregate the
  // merchant's full order book, not just the refunded/verified subset.
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(oh."merchantName", ''), oh."merchantId") AS "merchantName", oh."merchantId", COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmvFen", COALESCE(SUM(oh."${opts.amountColumn}"), 0) AS "${opts.amountAlias}", COUNT(CASE WHEN oh."paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount", COUNT(CASE WHEN oh."${opts.amountColumn}" > 0 THEN 1 END) AS "refundCount", COUNT(CASE WHEN oh."verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount" FROM "OrderHeader" oh WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')} AND oh."merchantId" IS NOT NULL GROUP BY oh."merchantId" HAVING COALESCE(SUM(oh."${opts.amountColumn}"), 0) > 0 ORDER BY "${opts.amountAlias}" DESC LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as MerchantMetricRow[];
}

// --- refund-order-merchants.ts ---
export async function topRefundMerchants(prisma: PrismaService, w: Window, limit: number) {
  const rows = await queryTopMerchantsByMetric(prisma, w, limit, {
    amountColumn: 'refundAmountFen',
    amountAlias: 'refundFen'
  });
  return rows.map((r) => {
    // Net GMV floored at 0 (refund can exceed recognized GMV for 0-paid orders).
    const gmv = Number(floorNonNegativeFen(toFenBigInt(r.gmvFen))) / 100;
    const refund = Number(r.refundFen ?? 0) / 100;
    const paidOrderCount = Number(r.paidOrderCount ?? 0);
    return {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      gmv,
      refund,
      // Unified 单数口径: 退款单数 / 支付单数.
      refundRate: rateByCount(Number(r.refundCount ?? 0), paidOrderCount)
    };
  });
}

// --- refund-order-header-today.ts ---
type TopRefundFn = (w: Window, limit: number) => Promise<RefundTodayPayload['topRefundMerchants']>;
type TopVerifyFn = (
  w: Window,
  limit: number
) => Promise<RefundVerifyTodayPayload['topVerifyMerchants']>;
export async function computeRefundFromOrderHeader(
  prisma: PrismaService,
  w: Window,
  topRefundMerchants: TopRefundFn
): Promise<RefundTodayPayload> {
  const { totalGmvFen, paidOrderCount } = await loadOrderHeaderRangeGmv(prisma, w);
  const { totalRefundFen, refundCount } = await loadOrderHeaderRangeRefundTotals(prisma, w);
  return {
    date: w.end,
    totalRefund: Number(totalRefundFen) / 100,
    // Net GMV (gross − refund) floored at 0 so the card never shows negative.
    totalGmv: Number(floorNonNegativeFen(totalGmvFen)) / 100,
    // Unified 单数口径: 退款单数 / 支付单数.
    refundRate: rateByCount(refundCount, paidOrderCount),
    refundCount,
    paidOrderCount,
    topRefundMerchants: await topRefundMerchants(w, 5),
    updatedAt: new Date().toISOString()
  };
}
export async function topVerifyMerchants(prisma: PrismaService, w: Window, limit: number) {
  const rows = await queryTopMerchantsByMetric(prisma, w, limit, {
    amountColumn: 'verifyAmountFen',
    amountAlias: 'verifyFen'
  });
  return rows.map((r) => {
    // Net GMV floored at 0 (refund can exceed recognized GMV for 0-paid orders).
    const gmv = Number(floorNonNegativeFen(toFenBigInt(r.gmvFen))) / 100;
    const verify = Number(r.verifyFen ?? 0) / 100;
    const paidOrderCount = Number(r.paidOrderCount ?? 0);
    return {
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      gmv,
      verify,
      // Unified 单数口径: 核销单数 / 支付单数.
      verifyRate: rateByCount(Number(r.verifyCount ?? 0), paidOrderCount)
    };
  });
}
export async function computeVerifyFromOrderHeader(
  prisma: PrismaService,
  w: Window,
  topVerifyMerchants: TopVerifyFn
): Promise<RefundVerifyTodayPayload> {
  const { totalGmvFen, paidOrderCount } = await loadOrderHeaderRangeGmv(prisma, w);
  const { totalVerifyFen, verifyCount } = await loadOrderHeaderRangeVerifyTotals(prisma, w);
  return {
    date: w.end,
    totalVerify: Number(totalVerifyFen) / 100,
    // Net GMV (gross − refund) floored at 0 so the card never shows negative.
    totalGmv: Number(floorNonNegativeFen(totalGmvFen)) / 100,
    // Unified 单数口径: 核销单数 / 支付单数.
    verifyRate: rateByCount(verifyCount, paidOrderCount),
    verifyCount,
    paidOrderCount,
    topVerifyMerchants: await topVerifyMerchants(w, 5),
    updatedAt: new Date().toISOString()
  };
}

// --- refund-order-header-trend-fill.ts ---
type TrendRow = {
  date: string;
  totalRefundFen: bigint | null;
  totalGmvFen: bigint | null;
  refundCount: number;
  paidOrderCount: number;
};
export async function queryRefundTrendRows(
  prisma: PrismaService,
  startBound: string,
  endBound: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT ${sqlBeijingDate('"paidTime"')} AS "date", COALESCE(SUM(CASE WHEN "refundAmountFen" > 0 THEN "refundAmountFen" ELSE 0 END), 0) AS "totalRefundFen", COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmvFen", COUNT(CASE WHEN "refundAmountFen" > 0 THEN 1 END) AS "refundCount", COUNT(CASE WHEN "paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} GROUP BY ${sqlBeijingDate('"paidTime"')} ORDER BY "date" ASC`,
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
    const paidOrderCount = Number(r?.paidOrderCount ?? 0);
    result.push({
      date: d,
      totalRefund: Number(r?.totalRefundFen ?? 0) / 100,
      // Unified 单数口径: 退款单数 / 支付单数.
      refundRate: rateByCount(Number(r?.refundCount ?? 0), paidOrderCount),
      refundCount: Number(r?.refundCount ?? 0),
      paidOrderCount
    });
  }
  return result;
}

type VerifyTrendRow = {
  date: string;
  totalVerifyFen: bigint | null;
  verifyCount: number;
  paidOrderCount: number;
};

export async function queryVerifyTrendRows(
  prisma: PrismaService,
  startBound: string,
  endBound: string
) {
  return (await prisma.$queryRawUnsafe(
    `SELECT ${sqlBeijingDate('"paidTime"')} AS "date", COALESCE(SUM(CASE WHEN "verifyTime" IS NOT NULL THEN "verifyAmountFen" ELSE 0 END), 0) AS "totalVerifyFen", COUNT(CASE WHEN "verifyTime" IS NOT NULL THEN 1 END) AS "verifyCount", COUNT(CASE WHEN "paidTime" IS NOT NULL THEN 1 END) AS "paidOrderCount" FROM "OrderHeader" WHERE ${sqlDatetimeExclusiveRange('"paidTime"')} GROUP BY ${sqlBeijingDate('"paidTime"')} ORDER BY "date" ASC`,
    startBound,
    endBound
  )) as VerifyTrendRow[];
}

export function fillVerifyTrendDays(
  rows: VerifyTrendRow[],
  startDate: string,
  days: number
): VerifyTrendPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDateKey(startDate, i);
    const row = byDate.get(date);
    const paidOrderCount = Number(row?.paidOrderCount ?? 0);
    const verifyCount = Number(row?.verifyCount ?? 0);
    return {
      date,
      totalVerify: Number(row?.totalVerifyFen ?? 0) / 100,
      verifyRate: rateByCount(verifyCount, paidOrderCount),
      verifyCount,
      paidOrderCount
    };
  });
}

function inclusiveDayCount(startDate: string, endDate: string): number {
  return (
    Math.round(
      (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000
    ) + 1
  );
}

export async function computeVerifyTrendFromOrderHeader(
  prisma: PrismaService,
  startDate: string,
  endDate: string
): Promise<VerifyTrendPoint[]> {
  const rows = await queryVerifyTrendRows(
    prisma,
    beijingDayRangeSqlite(startDate).start,
    beijingDayRangeSqlite(endDate).end
  );
  return fillVerifyTrendDays(rows, startDate, inclusiveDayCount(startDate, endDate));
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
  return fillRefundTrendDays(rows, startDate, inclusiveDayCount(startDate, endDate));
}
