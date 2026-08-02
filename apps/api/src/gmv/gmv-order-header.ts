/** Consolidated GMV module — compute, trend, distribution (queries in gmv-order-header.query). */
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { beijingDayRangeSqlite, gmvFromParts, rateAgainstGmv } from '../common';
import { DATA_ANALYSIS_OH_CONCURRENCY, mapPool } from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import { mapDistributionRows } from './gmv-metrics';
import {
  emptyTrendPoint,
  type GmvDistributionPayload,
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
  totalRefundFen: bigint | null,
  refundOrderCount: number,
  extras?: {
    monthGmvFen?: bigint | null;
    monthGmvOnlineFen?: bigint | null;
    monthGmvWalletFen?: bigint | null;
    prev?: OrderHeaderGmvRow | null;
    prevRefundFen?: bigint | null;
  }
): GmvTodayPayload {
  const isFen = gmvRow.paidAmountFen != null;
  const onlineFen = BigInt(
    Math.round(Number(gmvRow.paidAmountFen ?? (gmvRow as any).paidAmount ?? 0) * (isFen ? 1 : 100))
  );
  const walletFen = BigInt(
    Math.round(
      Number(gmvRow.paidAmountWalletFen ?? (gmvRow as any).paidAmountWallet ?? 0) *
        (isFen ? 1 : 100)
    )
  );
  const bonusFen = BigInt(
    Math.round(
      Number(gmvRow.paidAmountBonusFen ?? (gmvRow as any).paidAmountBonus ?? 0) * (isFen ? 1 : 100)
    )
  );
  const cardFen = BigInt(
    Math.round(
      Number(gmvRow.paidAmountCardFen ?? (gmvRow as any).paidAmountCard ?? 0) * (isFen ? 1 : 100)
    )
  );
  const verifyFen = BigInt(
    Math.round(
      Number(gmvRow.verifyAmountFen ?? (gmvRow as any).verifyAmount ?? 0) * (isFen ? 1 : 100)
    )
  );
  const refundFen = BigInt(
    Math.round(
      Number(totalRefundFen ?? 0) *
        (typeof totalRefundFen === 'bigint' || typeof totalRefundFen === 'number' ? 1 : 100)
    )
  );
  const grossGmvFen = gmvFromParts(onlineFen, walletFen);
  const totalGmvFen = grossGmvFen - refundFen;
  const paidOrderCount = Number(gmvRow.orderCount ?? 0);
  const avgOrderValue = paidOrderCount > 0 ? Number(totalGmvFen) / 100 / paidOrderCount : 0;
  const monthGmvFen = extras?.monthGmvFen ?? totalGmvFen;
  const monthGmvOnlineFen = extras?.monthGmvOnlineFen ?? onlineFen;
  const monthGmvWalletFen = extras?.monthGmvWalletFen ?? walletFen;

  let compare: GmvTodayPayload['compare'];
  if (extras?.prev) {
    const prevIsFen = extras.prev.paidAmountFen != null;
    const prevOnlineFen = BigInt(
      Math.round(
        Number(extras.prev.paidAmountFen ?? (extras.prev as any).paidAmount ?? 0) *
          (prevIsFen ? 1 : 100)
      )
    );
    const prevWalletFen = BigInt(
      Math.round(
        Number(extras.prev.paidAmountWalletFen ?? (extras.prev as any).paidAmountWallet ?? 0) *
          (prevIsFen ? 1 : 100)
      )
    );
    const prevGrossGmvFen = gmvFromParts(prevOnlineFen, prevWalletFen);
    const prevRefundFen = BigInt(
      Math.round(
        Number(extras.prevRefundFen ?? 0) *
          (typeof extras.prevRefundFen === 'bigint' || typeof extras.prevRefundFen === 'number'
            ? 1
            : 100)
      )
    );
    const prevGmvFen = prevGrossGmvFen - prevRefundFen;
    const prevOrders = Number(extras.prev.orderCount ?? 0);
    const prevVerifyFen = BigInt(
      Math.round(
        Number(extras.prev.verifyAmountFen ?? (extras.prev as any).verifyAmount ?? 0) *
          (prevIsFen ? 1 : 100)
      )
    );
    const prevAov = prevOrders > 0 ? Number(prevGmvFen) / 100 / prevOrders : 0;
    compare = {
      totalGmv: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      totalGmvFen: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      paidOrderCount: ratioDelta(paidOrderCount, prevOrders),
      avgOrderValue: ratioDelta(avgOrderValue, prevAov),
      refundRate: ratioDelta(
        rateAgainstGmv(Number(totalRefundFen ?? 0n) / 100, Number(totalGmvFen) / 100),
        rateAgainstGmv(Number(prevRefundFen) / 100, Number(prevGmvFen) / 100)
      ),
      verifyRate: ratioDelta(
        rateAgainstGmv(Number(verifyFen) / 100, Number(totalGmvFen) / 100),
        rateAgainstGmv(Number(prevVerifyFen) / 100, Number(prevGmvFen) / 100)
      )
    };
  }

  return {
    date,
    totalGmv: Number(totalGmvFen) / 100,
    monthGmv: Number(monthGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: onlineFen,
    gmvWalletFen: walletFen,
    gmvBonusFen: bonusFen,
    gmvCardFen: cardFen,
    totalRefundFen,
    refundRate: rateAgainstGmv(Number(totalRefundFen ?? 0n) / 100, Number(totalGmvFen) / 100),
    refundOrderCount,
    totalVerifyFen: verifyFen,
    verifyRate: rateAgainstGmv(Number(verifyFen) / 100, Number(totalGmvFen) / 100),
    paidOrderCount,
    paidAmountBonusFen: bonusFen,
    paidAmountWalletFen: walletFen,
    avgOrderValue,
    monthGmvFen,
    monthGmvOnlineFen,
    monthGmvWalletFen,
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
  const monthGrossGmvFen = gmvFromParts(
    BigInt(Number(monthRow.paidAmountFen ?? 0)),
    BigInt(Number(monthRow.paidAmountWalletFen ?? 0))
  );
  const monthRefundFen = BigInt(Number(monthRow.refundAmountFen ?? 0));
  const monthGmvFen = monthGrossGmvFen - monthRefundFen;
  const monthGmvOnlineFen = BigInt(Number(monthRow.paidAmountFen ?? 0));
  const monthGmvWalletFen = BigInt(Number(monthRow.paidAmountWalletFen ?? 0));

  return buildOrderHeaderTodayPayload(
    date,
    gmvRow,
    BigInt(Number(refundRows[0]?.totalRefundFen ?? 0)),
    Number(refundRows[0]?.refundOrderCount ?? 0),
    {
      monthGmvFen,
      monthGmvOnlineFen,
      monthGmvWalletFen,
      prev: prevGmvRows[0] ?? null,
      prevRefundFen: BigInt(Number(prevRefundRows[0]?.totalRefundFen ?? 0))
    }
  );
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
    const grossGmvFen = gmvFromParts(
      BigInt(Number(b.paidAmountFen ?? 0n)),
      BigInt(Number(b.paidAmountWalletFen ?? 0n))
    );
    const refundFen = BigInt(Number(b.refundAmountFen ?? 0n));
    const totalGmvFen = grossGmvFen - refundFen;
    result.push({
      date: d,
      totalGmv: Number(totalGmvFen) / 100,
      totalGmvFen,
      gmvOnlineFen: BigInt(Number(b.paidAmountFen ?? 0n)),
      gmvWalletFen: BigInt(Number(b.paidAmountWalletFen ?? 0n)),
      gmvBonusFen: BigInt(Number(b.paidAmountBonusFen ?? 0n)),
      totalRefundFen: refundFen,
      refundRate: rateAgainstGmv(Number(b.refundAmountFen ?? 0n) / 100, Number(grossGmvFen) / 100),
      verifyRate: rateAgainstGmv(Number(b.verifyAmountFen ?? 0n) / 100, Number(grossGmvFen) / 100),
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
  const { totalGmvFen, rows } =
    dim === 'area'
      ? await loadOrderHeaderAreaDistribution(prisma, startBound, endBound, safeLimit)
      : await loadOrderHeaderCategoryDistribution(prisma, startBound, endBound, safeLimit);

  if (totalGmvFen <= 0n) return empty;
  // Residual #289: pass limit so payload projects honesty even when head is full.
  const totalGmv = totalGmvFen;
  return mapDistributionRows(rows, totalGmv, safeLimit);
}
