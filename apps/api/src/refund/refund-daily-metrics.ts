/** Consolidated refund module. */
import { shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { topRefundMerchants, topVerifyMerchants } from './refund-order-header';
import type {
  RefundTodayPayload,
  RefundTrendPoint,
  RefundVerifyTodayPayload,
  VerifyTrendPoint
} from './refund.dto';

// --- refund-trend-points.ts ---
type RefundTrendRow = {
  date: string;
  totalRefund: number;
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
    result.push({
      date: d,
      totalRefund: Number(r?.totalRefund ?? 0),
      refundRate: Number(r?.refundRate ?? 0),
      refundCount: Number(r?.refundCount ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0)
    });
  }
  return result;
}

// --- verify-trend-points.ts ---
type VerifyTrendRow = {
  date: string;
  totalVerify: number;
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
    result.push({
      date: d,
      totalVerify: Number(r?.totalVerify ?? 0),
      verifyRate: Number(r?.verifyRate ?? 0),
      verifyCount: Number(r?.verifyCount ?? 0),
      paidOrderCount: Number(r?.paidOrderCount ?? 0)
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
      totalRefund: true,
      totalGmv: true,
      refundRate: true,
      refundCount: true,
      paidOrderCount: true,
      updatedAt: true
    }
  });
  if (!dm) return null;
  return {
    date: dm.date,
    totalRefund: Number(dm.totalRefund),
    totalGmv: Number(dm.totalGmv),
    refundRate: Number(dm.refundRate),
    refundCount: dm.refundCount,
    paidOrderCount: dm.paidOrderCount,
    topRefundMerchants: await topRefundMerchants(prisma, target, 5),
    updatedAt: dm.updatedAt.toISOString()
  };
}
export async function refundTrendFromDailyMetrics(
  prisma: PrismaService,
  start: string,
  days: number
): Promise<RefundTrendPoint[] | null> {
  const end = shiftDateKey(start, days - 1);
  const dm = (await prisma.dailyMetrics.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      totalRefund: true,
      refundRate: true,
      refundCount: true,
      paidOrderCount: true
    }
  })) as RefundTrendRow[];
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
      totalVerify: true,
      totalGmv: true,
      verifyRate: true,
      verifyCount: true,
      paidOrderCount: true,
      updatedAt: true
    }
  });
  if (!dm) return null;
  return {
    date: dm.date,
    totalVerify: Number(dm.totalVerify),
    totalGmv: Number(dm.totalGmv),
    verifyRate: Number(dm.verifyRate),
    verifyCount: dm.verifyCount,
    paidOrderCount: dm.paidOrderCount,
    topVerifyMerchants: await topVerifyMerchants(prisma, target, 5),
    updatedAt: dm.updatedAt.toISOString()
  };
}
export async function verifyTrendFromDailyMetrics(
  prisma: PrismaService,
  start: string,
  days: number
): Promise<VerifyTrendPoint[] | null> {
  const end = shiftDateKey(start, days - 1);
  const dm = (await prisma.dailyMetrics.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      totalVerify: true,
      verifyRate: true,
      verifyCount: true,
      paidOrderCount: true
    }
  })) as VerifyTrendRow[];
  return dm.length ? buildVerifyTrendPoints(dm, start, days) : null;
}
