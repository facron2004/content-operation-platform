/** DailyMetrics trend mapping and date-series completion. */
import { shiftDateKey } from '@content/shared';
import { netGmvParts, rateByCount, toFenBigInt } from '../common';
import { emptyTrendPoint, type GmvTrendPoint } from './gmv.dto';

export type DailyMetricsTrendRow = {
  date: string;
  totalGmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  totalRefundFen: bigint | null;
  totalVerifyFen?: bigint | null;
  refundRate: number;
  verifyRate: number;
  refundCount: number;
  verifyCount: number;
  paidOrderCount: number;
};

export function mapDailyMetricsTrendRow(r: DailyMetricsTrendRow): GmvTrendPoint {
  const grossGmvFen = toFenBigInt(
    r.totalGmvFen ?? (r as unknown as { totalGmv?: number }).totalGmv,
    r.totalGmvFen != null ? 1 : 100
  );
  const totalRefundFen = toFenBigInt(
    r.totalRefundFen ?? (r as unknown as { totalRefund?: number }).totalRefund,
    r.totalRefundFen != null ? 1 : 100
  );
  const totalGmvFen = grossGmvFen - totalRefundFen;
  const onlineFen = toFenBigInt(r.gmvOnlineFen);
  const walletFen = toFenBigInt(r.gmvWalletFen);
  const netParts = netGmvParts(onlineFen, walletFen, totalRefundFen);
  const paidOrderCount = r.paidOrderCount ?? 0;
  const refundCount = Number(r.refundCount ?? 0);
  const verifyCount = Number(r.verifyCount ?? 0);
  const refundRate = rateByCount(refundCount, paidOrderCount);
  const verifyRate = rateByCount(verifyCount, paidOrderCount);
  return {
    date: r.date,
    totalGmv: Number(totalGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: netParts.onlineFen,
    gmvWalletFen: netParts.walletFen,
    gmvBonusFen: r.gmvBonusFen,
    totalRefundFen,
    refundRate,
    verifyRate,
    paidOrderCount,
    refundCount,
    verifyCount
  };
}

export function mapDailyMetricsTrend(
  dmRows: DailyMetricsTrendRow[],
  start: string,
  days: number
): GmvTrendPoint[] {
  const result = dmRows.map(mapDailyMetricsTrendRow);
  const byDate = new Map(result.map((p) => [p.date, p]));
  const filled: GmvTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDateKey(start, i);
    filled.push(byDate.get(d) ?? emptyTrendPoint(d));
  }
  return filled;
}
