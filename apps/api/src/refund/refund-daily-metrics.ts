/** Consolidated refund module. */
import { shiftDateKey } from '@content/shared';
import { floorNonNegativeFen, rateByCount } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { topRefundMerchants, topVerifyMerchants } from './refund-order-header';
import type {
  RefundTodayPayload,
  RefundTrendPoint,
  RefundVerifyTodayPayload,
  VerifyTrendPoint
} from './refund.dto';

function netGmvFen(totalGmvFen: bigint | null, totalRefundFen: bigint | null): bigint {
  // Net GMV can never be negative in a KPI — floor at 0 so the refund/verify
  // card does not show a negative GMV when refunds exceed recognized sales.
  return floorNonNegativeFen((totalGmvFen ?? 0n) - (totalRefundFen ?? 0n));
}

// --- refund-trend-points.ts ---
type RefundTrendRow = {
  date: string;
  totalRefundFen: bigint | null;
  totalGmvFen: bigint | null;
  refundRate: number;
  refundCount: number;
  paidOrderCount: number;
};
export function buildRefundTrendPoints(
  rows: RefundTrendRow[],
  start: string,
  days: number
): RefundTrendPoint[] {
  const map = new Map(rows.map((r) => [r.date, r])),
    result: RefundTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      r = map.get(d);
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

// --- verify-trend-points.ts ---
type VerifyTrendRow = {
  date: string;
  totalVerifyFen: bigint | null;
  totalGmvFen: bigint | null;
  totalRefundFen: bigint | null;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
};
export function buildVerifyTrendPoints(
  rows: VerifyTrendRow[],
  start: string,
  days: number
): VerifyTrendPoint[] {
  const map = new Map(rows.map((r) => [r.date, r])),
    result: VerifyTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i),
      r = map.get(d);
    const paidOrderCount = Number(r?.paidOrderCount ?? 0);
    result.push({
      date: d,
      totalVerify: Number(r?.totalVerifyFen ?? 0) / 100,
      // Unified 单数口径: 核销单数 / 支付单数.
      verifyRate: rateByCount(Number(r?.verifyCount ?? 0), paidOrderCount),
      verifyCount: Number(r?.verifyCount ?? 0),
      paidOrderCount
    });
  }
  return result;
}

// --- refund-daily-metrics.ts ---
export async function refundTodayFromDailyMetrics(
  prisma: PrismaService,
  target: string
): Promise<RefundTodayPayload | null> {
  const dm = await prisma.dailyMetrics.findUnique({
    where: { date: target },
    select: {
      date: true,
      totalRefundFen: true,
      totalGmvFen: true,
      refundRate: true,
      refundCount: true,
      paidOrderCount: true,
      updatedAt: true
    }
  });
  if (!dm) return null;
  return {
    date: dm.date,
    totalRefund: Number(dm.totalRefundFen ?? 0) / 100,
    totalGmv: Number(netGmvFen(dm.totalGmvFen, dm.totalRefundFen)) / 100,
    // Unified 单数口径: 退款单数 / 支付单数 (recomputed from counts for consistency).
    refundRate: rateByCount(Number(dm.refundCount ?? 0), Number(dm.paidOrderCount ?? 0)),
    refundCount: dm.refundCount,
    paidOrderCount: dm.paidOrderCount,
    topRefundMerchants: await topRefundMerchants(prisma, { start: target, end: target }, 5),
    updatedAt: dm.updatedAt.toISOString()
  };
}
export async function refundTrendFromDailyMetrics(
  prisma: PrismaService,
  start: string,
  days: number
): Promise<RefundTrendPoint[] | null> {
  const end = shiftDateKey(start, days - 1);
  const dm = await prisma.dailyMetrics.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      totalRefundFen: true,
      totalGmvFen: true,
      refundRate: true,
      refundCount: true,
      paidOrderCount: true
    }
  });
  return dm.length ? buildRefundTrendPoints(dm, start, days) : null;
}

// --- verify-daily-metrics.ts ---
export async function verifyTodayFromDailyMetrics(
  prisma: PrismaService,
  target: string
): Promise<RefundVerifyTodayPayload | null> {
  const dm = await prisma.dailyMetrics.findUnique({
    where: { date: target },
    select: {
      date: true,
      totalVerifyFen: true,
      totalGmvFen: true,
      totalRefundFen: true,
      verifyRate: true,
      verifyCount: true,
      paidOrderCount: true,
      updatedAt: true
    }
  });
  if (!dm) return null;
  return {
    date: dm.date,
    totalVerify: Number(dm.totalVerifyFen ?? 0) / 100,
    totalGmv: Number(netGmvFen(dm.totalGmvFen, dm.totalRefundFen)) / 100,
    // Unified 单数口径: 核销单数 / 支付单数 (recomputed from counts for consistency).
    verifyRate: rateByCount(Number(dm.verifyCount ?? 0), Number(dm.paidOrderCount ?? 0)),
    verifyCount: dm.verifyCount,
    paidOrderCount: dm.paidOrderCount,
    topVerifyMerchants: await topVerifyMerchants(prisma, { start: target, end: target }, 5),
    updatedAt: dm.updatedAt.toISOString()
  };
}
export async function verifyTrendFromDailyMetrics(
  prisma: PrismaService,
  start: string,
  days: number
): Promise<VerifyTrendPoint[] | null> {
  const end = shiftDateKey(start, days - 1);
  const dm = await prisma.dailyMetrics.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      totalVerifyFen: true,
      totalGmvFen: true,
      totalRefundFen: true,
      verifyRate: true,
      verifyCount: true,
      paidOrderCount: true
    }
  });
  return dm.length ? buildVerifyTrendPoints(dm, start, days) : null;
}
