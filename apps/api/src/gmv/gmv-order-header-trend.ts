import { shiftDateKey } from '@content/shared';
import {
  beijingDayRangeSqlite,
  gmvFromParts,
  netGmvParts,
  rateByCount,
  toFenBigInt
} from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { emptyTrendPoint, type GmvTrendPoint } from './gmv.dto';
import { queryOrderHeaderTrendAgg, type TrendAggRow } from './gmv-order-header.query';

type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

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
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const result: GmvTrendPoint[] = [];
  for (let i = 0; i < countInclusiveDays(startDate, endDate); i++) {
    const d = shiftDateKey(startDate, i);
    const b = byDate.get(d);
    if (!b) {
      result.push(emptyTrendPoint(d));
      continue;
    }
    const grossGmvFen = gmvFromParts(
      toFenBigInt(b.paidAmountFen),
      toFenBigInt(b.paidAmountWalletFen)
    );
    const refundFen = toFenBigInt(b.refundAmountFen);
    const totalGmvFen = grossGmvFen - refundFen;
    const netParts = netGmvParts(
      toFenBigInt(b.paidAmountFen),
      toFenBigInt(b.paidAmountWalletFen),
      refundFen
    );
    const paidOrderCount = Number(b.orderCount);
    // Unified 单数口径: 退款率 = 退款单数 / 支付单数, 核销率 = 核销单数 / 支付单数.
    result.push({
      date: d,
      totalGmv: Number(totalGmvFen) / 100,
      totalGmvFen,
      gmvOnlineFen: netParts.onlineFen,
      gmvWalletFen: netParts.walletFen,
      gmvBonusFen: toFenBigInt(b.paidAmountBonusFen),
      totalRefundFen: refundFen,
      refundRate: rateByCount(Number(b.refundOrderCount ?? 0), paidOrderCount),
      verifyRate: rateByCount(Number(b.verifyCount ?? 0), paidOrderCount),
      paidOrderCount,
      refundCount: Number(b.refundOrderCount ?? 0),
      verifyCount: Number(b.verifyCount ?? 0)
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
