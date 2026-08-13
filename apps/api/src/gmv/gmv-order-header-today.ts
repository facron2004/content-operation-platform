import { shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  gmvFromParts,
  netGmvParts,
  rateByCount,
  toFenBigInt
} from '../common';
import { DATA_ANALYSIS_OH_CONCURRENCY, mapPool } from '../common/sql-chunk';
import { PrismaService } from '../prisma/prisma.service';
import { type GmvHourlyPoint, type GmvTodayPayload } from './gmv.dto';
import { EMPTY_ORDER_HEADER_GMV_ROW, type OrderHeaderGmvRow } from './gmv-order-header.types';
import {
  queryOrderHeaderGmv,
  queryOrderHeaderHourly,
  queryOrderHeaderRefund
} from './gmv-order-header.query';

type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

export function buildOrderHeaderTodayPayload(
  date: string,
  gmvRow: OrderHeaderGmvRow,
  totalRefundFen: bigint | null,
  extras?: {
    monthGmvFen?: bigint | null;
    monthGmvOnlineFen?: bigint | null;
    monthGmvWalletFen?: bigint | null;
    prev?: OrderHeaderGmvRow | null;
    prevRefundFen?: bigint | null;
  }
): GmvTodayPayload {
  const isFen = gmvRow.paidAmountFen != null;
  const onlineFen = toFenBigInt(
    gmvRow.paidAmountFen ?? (gmvRow as unknown as { paidAmount?: number }).paidAmount,
    isFen ? 1 : 100
  );
  const walletFen = toFenBigInt(
    gmvRow.paidAmountWalletFen ??
      (gmvRow as unknown as { paidAmountWallet?: number }).paidAmountWallet,
    isFen ? 1 : 100
  );
  const bonusFen = toFenBigInt(
    gmvRow.paidAmountBonusFen ??
      (gmvRow as unknown as { paidAmountBonus?: number }).paidAmountBonus,
    isFen ? 1 : 100
  );
  const cardFen = toFenBigInt(
    gmvRow.paidAmountCardFen ?? (gmvRow as unknown as { paidAmountCard?: number }).paidAmountCard,
    isFen ? 1 : 100
  );
  const verifyFen = toFenBigInt(
    gmvRow.verifyAmountFen ?? (gmvRow as unknown as { verifyAmount?: number }).verifyAmount,
    isFen ? 1 : 100
  );
  const refundFen = toFenBigInt(totalRefundFen);
  const grossGmvFen = gmvFromParts(onlineFen, walletFen);
  const totalGmvFen = grossGmvFen - refundFen;
  const netParts = netGmvParts(onlineFen, walletFen, refundFen);
  const paidOrderCount = Number(gmvRow.orderCount ?? 0);
  const refundOrderCount = Number(gmvRow.refundOrderCount ?? 0);
  const verifyOrderCount = Number(gmvRow.verifyCount ?? 0);
  const avgOrderValue = paidOrderCount > 0 ? Number(totalGmvFen) / 100 / paidOrderCount : 0;
  const monthGmvFen = extras?.monthGmvFen ?? totalGmvFen;
  const monthGmvOnlineFen = extras?.monthGmvOnlineFen ?? netParts.onlineFen;
  const monthGmvWalletFen = extras?.monthGmvWalletFen ?? monthGmwWalletFenOr(netParts.walletFen);

  // Unified 单数口径: 退款率 = 退款单数 / 支付单数, 核销率 = 核销单数 / 支付单数.
  const refundRate = rateByCount(refundOrderCount, paidOrderCount);
  const verifyRate = rateByCount(verifyOrderCount, paidOrderCount);

  let compare: GmvTodayPayload['compare'];
  if (extras?.prev) {
    const prevIsFen = extras.prev.paidAmountFen != null;
    const prevOnlineFen = toFenBigInt(
      extras.prev.paidAmountFen ?? (extras.prev as unknown as { paidAmount?: number }).paidAmount,
      prevIsFen ? 1 : 100
    );
    const prevWalletFen = toFenBigInt(
      extras.prev.paidAmountWalletFen ??
        (extras.prev as unknown as { paidAmountWallet?: number }).paidAmountWallet,
      prevIsFen ? 1 : 100
    );
    const prevGrossGmvFen = gmvFromParts(prevOnlineFen, prevWalletFen);
    const prevRefundFen = toFenBigInt(extras.prevRefundFen);
    const prevGmvFen = prevGrossGmvFen - prevRefundFen;
    const prevOrders = Number(extras.prev.orderCount ?? 0);
    const prevAov = prevOrders > 0 ? Number(prevGmvFen) / 100 / prevOrders : 0;
    const prevRefundRate = rateByCount(Number(extras.prev.refundOrderCount ?? 0), prevOrders);
    const prevVerifyRate = rateByCount(Number(extras.prev.verifyCount ?? 0), prevOrders);
    compare = {
      totalGmv: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      totalGmvFen: ratioDelta(Number(totalGmvFen) / 100, Number(prevGmvFen) / 100),
      paidOrderCount: ratioDelta(paidOrderCount, prevOrders),
      avgOrderValue: ratioDelta(avgOrderValue, prevAov),
      refundRate: ratioDelta(refundRate, prevRefundRate),
      verifyRate: ratioDelta(verifyRate, prevVerifyRate)
    };
  }

  return {
    date,
    totalGmv: Number(totalGmvFen) / 100,
    monthGmv: Number(monthGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: netParts.onlineFen,
    gmvWalletFen: netParts.walletFen,
    gmvBonusFen: bonusFen,
    gmvCardFen: cardFen,
    totalRefundFen: refundFen,
    refundRate,
    refundOrderCount,
    verifyOrderCount,
    totalVerifyFen: verifyFen,
    verifyRate,
    paidOrderCount,
    paidAmountBonusFen: bonusFen,
    paidAmountWalletFen: walletFen,
    avgOrderValue,
    monthGmvFen,
    monthGmvOnlineFen,
    monthGmvWalletFen,
    compare,
    updatedAt: sourceUpdatedAtIso(gmvRow.sourceUpdatedAt),
    dataSource: 'OrderHeader'
  };
}

/** SQLite datetime() returns UTC without a zone suffix; normalize it for the API contract. */
function sourceUpdatedAtIso(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();

  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasZone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Small helper to keep the month wallet assignment readable and typo-safe.
function monthGmwWalletFenOr(walletFen: bigint): bigint {
  return walletFen;
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
    toFenBigInt(monthRow.paidAmountFen),
    toFenBigInt(monthRow.paidAmountWalletFen)
  );
  const monthRefundFen = toFenBigInt(monthRow.refundAmountFen);
  const monthGmvFen = monthGrossGmvFen - monthRefundFen;
  const monthParts = netGmvParts(
    toFenBigInt(monthRow.paidAmountFen),
    toFenBigInt(monthRow.paidAmountWalletFen),
    monthRefundFen
  );
  const monthGmvOnlineFen = monthParts.onlineFen;
  const monthGmvWalletFen = monthParts.walletFen;

  return buildOrderHeaderTodayPayload(date, gmvRow, toFenBigInt(refundRows[0]?.totalRefundFen), {
    monthGmvFen,
    monthGmvOnlineFen,
    monthGmvWalletFen,
    prev: prevGmvRows[0] ?? null,
    prevRefundFen: toFenBigInt(prevRefundRows[0]?.totalRefundFen)
  });
}

export async function computeHourlyFromOrderHeader(
  prisma: PrismaLike,
  date: string
): Promise<GmvHourlyPoint[]> {
  const { start, end } = beijingDayRangeSqlite(date);
  return queryOrderHeaderHourly(prisma, start, end);
}
