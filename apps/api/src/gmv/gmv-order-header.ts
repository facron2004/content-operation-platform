/** Consolidated GMV module — compute, trend, distribution (queries in gmv-order-header.query). */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { beijingDayRangeSqlite, gmvFromParts, rateAgainstGmv } from '../common';
import { DATA_ANALYSIS_OH_CONCURRENCY, mapPool } from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import { mapDistributionRows } from './gmv-metrics';
import {
  emptyTrendPoint,
  type GmvDistributionPayload,
  type GmvDistributionRow,
  type GmvHourlyPoint,
  type GmvTodayPayload,
  type GmvTrendPoint
} from './gmv.dto';
import { EMPTY_ORDER_HEADER_GMV_ROW, type OrderHeaderGmvRow } from './gmv-order-header.types';
import {
  loadOrderHeaderAreaDistribution,
  loadOrderHeaderCategoryDistribution,
  queryOrderHeaderGmv,
  queryOrderHeaderHourly,
  queryOrderHeaderRefund,
  queryOrderHeaderTrendAgg,
  type TrendAggRow
} from './gmv-order-header.query';

export { type OrderLike } from './gmv-order-header.types';
export { upsertOrderHeaderIso, batchUpsertOrderHeaders } from './gmv-order-header.upsert';
export {
  queryOrderHeaderGmv,
  queryOrderHeaderRefund,
  queryOrderHeaderHourly,
  loadOrderHeaderAreaDistribution,
  loadOrderHeaderCategoryDistribution
} from './gmv-order-header.query';

type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

// ── Today payload ────────────────────────────────────

export function buildOrderHeaderTodayPayload(
  date: string,
  gmvRow: OrderHeaderGmvRow,
  totalRefund: number,
  extras?: {
    monthGmv?: number;
    monthGmvOnline?: number;
    monthGmvWallet?: number;
    prev?: OrderHeaderGmvRow | null;
    prevRefund?: number;
  }
): GmvTodayPayload {
  const online = Number(gmvRow.paidAmount);
  const wallet = Number(gmvRow.paidAmountWallet);
  const bonus = Number(gmvRow.paidAmountBonus);
  const card = Number(gmvRow.paidAmountCard);
  const verify = Number(gmvRow.verifyAmount);
  const totalGmv = gmvFromParts(online, wallet);
  const paidOrderCount = Number(gmvRow.orderCount);
  const avgOrderValue = paidOrderCount > 0 ? totalGmv / paidOrderCount : 0;
  const monthGmv = Number(extras?.monthGmv ?? totalGmv);
  const monthGmvOnline = Number(extras?.monthGmvOnline ?? online);
  const monthGmvWallet = Number(extras?.monthGmvWallet ?? wallet);

  let compare: GmvTodayPayload['compare'];
  if (extras?.prev) {
    const prevOnline = Number(extras.prev.paidAmount);
    const prevWallet = Number(extras.prev.paidAmountWallet);
    const prevGmv = gmvFromParts(prevOnline, prevWallet);
    const prevOrders = Number(extras.prev.orderCount);
    const prevRefund = Number(extras.prevRefund ?? 0);
    const prevVerify = Number(extras.prev.verifyAmount);
    const prevAov = prevOrders > 0 ? prevGmv / prevOrders : 0;
    compare = {
      totalGmv: ratioDelta(totalGmv, prevGmv),
      paidOrderCount: ratioDelta(paidOrderCount, prevOrders),
      avgOrderValue: ratioDelta(avgOrderValue, prevAov),
      refundRate: ratioDelta(
        rateAgainstGmv(totalRefund, totalGmv),
        rateAgainstGmv(prevRefund, prevGmv)
      ),
      verifyRate: ratioDelta(rateAgainstGmv(verify, totalGmv), rateAgainstGmv(prevVerify, prevGmv))
    };
  }

  return {
    date,
    totalGmv,
    gmvOnline: online,
    gmvWallet: wallet,
    gmvBonus: bonus,
    gmvCard: card,
    totalRefund,
    refundRate: rateAgainstGmv(totalRefund, totalGmv),
    totalVerify: verify,
    verifyRate: rateAgainstGmv(verify, totalGmv),
    paidOrderCount,
    paidAmountBonus: bonus,
    paidAmountWallet: wallet,
    avgOrderValue,
    monthGmv,
    monthGmvOnline,
    monthGmvWallet,
    platformCommission: 0,
    compare,
    updatedAt: new Date().toISOString(),
    dataSource: 'OrderHeader'
  };
}

function ratioDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export async function computeFromOrderHeader(
  prisma: PrismaLike,
  date: string
): Promise<GmvTodayPayload> {
  const { start: startBound, end: endBound } = beijingDayRangeSqlite(date);
  const monthStart = `${date.slice(0, 7)}-01`;
  const { start: monthStartBound } = beijingDayRangeSqlite(monthStart);
  const prevDate = shiftDateKey(date, -1);
  const { start: prevStart, end: prevEnd } = beijingDayRangeSqlite(prevDate);

  // Cap concurrent OH aggregates (parity with data-analysis mapPool) — 5-way
  // Promise.all storms SQLite under multi-tab home + GMV cold path.
  const ohJobs: Array<() => Promise<unknown>> = [
    () => queryOrderHeaderGmv(prisma, startBound, endBound),
    () => queryOrderHeaderRefund(prisma, startBound, endBound),
    () => queryOrderHeaderGmv(prisma, monthStartBound, endBound),
    () => queryOrderHeaderGmv(prisma, prevStart, prevEnd),
    () => queryOrderHeaderRefund(prisma, prevStart, prevEnd)
  ];
  const [gmvRows, refundRows, monthRows, prevGmvRows, prevRefundRows] = (await mapPool(
    ohJobs,
    DATA_ANALYSIS_OH_CONCURRENCY,
    (job) => job()
  )) as [
    Awaited<ReturnType<typeof queryOrderHeaderGmv>>,
    Awaited<ReturnType<typeof queryOrderHeaderRefund>>,
    Awaited<ReturnType<typeof queryOrderHeaderGmv>>,
    Awaited<ReturnType<typeof queryOrderHeaderGmv>>,
    Awaited<ReturnType<typeof queryOrderHeaderRefund>>
  ];

  const gmvRow = gmvRows[0] ?? EMPTY_ORDER_HEADER_GMV_ROW;
  const monthRow = monthRows[0] ?? EMPTY_ORDER_HEADER_GMV_ROW;
  const monthGmv = gmvFromParts(Number(monthRow.paidAmount), Number(monthRow.paidAmountWallet));
  const monthGmvOnline = Number(monthRow.paidAmount);
  const monthGmvWallet = Number(monthRow.paidAmountWallet);

  return buildOrderHeaderTodayPayload(date, gmvRow, Number(refundRows[0]?.totalRefund ?? 0), {
    monthGmv,
    monthGmvOnline,
    monthGmvWallet,
    prev: prevGmvRows[0] ?? null,
    prevRefund: Number(prevRefundRows[0]?.totalRefund ?? 0)
  });
}

export async function computeHourlyFromOrderHeader(
  prisma: PrismaLike,
  date: string
): Promise<GmvHourlyPoint[]> {
  const { start, end } = beijingDayRangeSqlite(date);
  return queryOrderHeaderHourly(prisma, start, end);
}

// ── Trend ────────────────────────────────────────────

function countInclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00+08:00').getTime();
  const end = new Date(endDate + 'T00:00:00+08:00').getTime();
  if (start > end) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

export function mapOrderHeaderTrendRows(
  rows: TrendAggRow[],
  startDate: string,
  endDate: string
): GmvTrendPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r])),
    result: GmvTrendPoint[] = [];
  for (let i = 0; i < countInclusiveDays(startDate, endDate); i++) {
    const d = shiftDateKey(startDate, i),
      b = byDate.get(d);
    if (!b) {
      result.push(emptyTrendPoint(d));
      continue;
    }
    const gmv = gmvFromParts(Number(b.paidAmount), Number(b.paidAmountWallet));
    result.push({
      date: d,
      totalGmv: gmv,
      gmvOnline: Number(b.paidAmount),
      gmvWallet: Number(b.paidAmountWallet),
      gmvBonus: Number(b.paidAmountBonus),
      totalRefund: Number(b.refundAmount),
      refundRate: rateAgainstGmv(Number(b.refundAmount), gmv),
      verifyRate: rateAgainstGmv(Number(b.verifyAmount), gmv),
      paidOrderCount: Number(b.orderCount)
    });
  }
  return result;
}

export async function computeTrendFromOrderHeader(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<GmvTrendPoint[]> {
  const { start: dayStart } = beijingDayRangeSqlite(startDate);
  const { end: dayEnd } = beijingDayRangeSqlite(endDate);
  const rows = await queryOrderHeaderTrendAgg(prisma, dayStart, dayEnd);
  return mapOrderHeaderTrendRows(rows, startDate, endDate);
}

// ── Distribution ─────────────────────────────────────

function weekWindowBounds() {
  const todayStr = beijingDateKey(new Date());
  const weekAgoStr = beijingDateKey(Date.now() - 6 * 86400000);
  return {
    startBound: beijingDayRangeSqlite(weekAgoStr).start,
    endBound: beijingDayRangeSqlite(todayStr).end
  };
}

export async function computeDistributionFromOrderHeader(
  prisma: PrismaLike,
  dim: string,
  limit: number
): Promise<GmvDistributionPayload> {
  const safeLimit = Math.max(1, Math.floor(limit) || 20);
  const empty: GmvDistributionPayload = {
    items: [],
    limit: safeLimit,
    matched: 0,
    truncated: false
  };
  if (dim !== 'area' && dim !== 'category') return empty;

  const { startBound, endBound } = weekWindowBounds();
  const { totalGmv, rows } =
    dim === 'area'
      ? await loadOrderHeaderAreaDistribution(prisma, startBound, endBound, safeLimit)
      : await loadOrderHeaderCategoryDistribution(prisma, startBound, endBound, safeLimit);

  if (totalGmv <= 0) return empty;
  // Residual #289: pass limit so payload projects honesty even when head is full.
  return mapDistributionRows(rows, totalGmv, safeLimit);
}
