/** DailyMetrics KPI projection with fen-precise net GMV semantics. */
import { netGmvParts, rateByCount, toFenBigInt } from '../common';
import type { GmvTodayPayload } from './gmv.dto';

export type DailyMetricsKpiRow = {
  date: string;
  totalGmvFen: bigint | null;
  gmvOnlineFen: bigint | null;
  gmvWalletFen: bigint | null;
  gmvBonusFen: bigint | null;
  gmvCardFen: bigint | null;
  totalRefundFen: bigint | null;
  refundRate: number;
  refundCount: number;
  totalVerifyFen: bigint | null;
  verifyRate: number;
  verifyCount: number;
  paidOrderCount: number;
  paidAmountBonusFen: bigint | null;
  paidAmountWalletFen: bigint | null;
  updatedAt: Date;
};

/** 单数口径: 退款率 = 退款单数 / 支付单数, 核销率 = 核销单数 / 支付单数. (不再使用金额口径) */
export function mapDailyMetricsToKpi(
  dmRow: DailyMetricsKpiRow,
  extras?: {
    monthGmvFen?: bigint | null;
    monthGmvOnlineFen?: bigint | null;
    monthGmvWalletFen?: bigint | null;
    prev?: DailyMetricsKpiRow | null;
  }
): GmvTodayPayload {
  const grossGmvFen = toFenBigInt(
    dmRow.totalGmvFen ?? (dmRow as unknown as { totalGmv?: number }).totalGmv,
    dmRow.totalGmvFen != null ? 1 : 100
  );
  const totalRefundFen = toFenBigInt(
    dmRow.totalRefundFen ?? (dmRow as unknown as { totalRefund?: number }).totalRefund,
    dmRow.totalRefundFen != null ? 1 : 100
  );
  const totalGmvFen = grossGmvFen - totalRefundFen;
  const onlineFen = toFenBigInt(
    dmRow.gmvOnlineFen ?? (dmRow as unknown as { gmvOnline?: number }).gmvOnline,
    dmRow.gmvOnlineFen != null ? 1 : 100
  );
  const walletFen = toFenBigInt(
    dmRow.gmvWalletFen ?? (dmRow as unknown as { gmvWallet?: number }).gmvWallet,
    dmRow.gmvWalletFen != null ? 1 : 100
  );
  const netParts = netGmvParts(onlineFen, walletFen, totalRefundFen);
  const paidOrderCount = dmRow.paidOrderCount ?? 0;
  const avgOrderValue = paidOrderCount > 0 ? Number(totalGmvFen) / 100 / paidOrderCount : 0;
  const monthGmvFen = extras?.monthGmvFen ?? totalGmvFen;
  const monthGmvOnlineFen = extras?.monthGmvOnlineFen ?? netParts.onlineFen;
  const monthGmvWalletFen = extras?.monthGmvWalletFen ?? netParts.walletFen;
  const refundRate = rateByCount(Number(dmRow.refundCount), paidOrderCount);
  const verifyRate = rateByCount(Number(dmRow.verifyCount), paidOrderCount);

  let compare: GmvTodayPayload['compare'];
  if (extras?.prev) {
    const prevGrossGmvFen = toFenBigInt(
      extras.prev.totalGmvFen ?? (extras.prev as unknown as { totalGmv?: number }).totalGmv,
      extras.prev.totalGmvFen != null ? 1 : 100
    );
    const prevRefundFen = toFenBigInt(
      extras.prev.totalRefundFen ??
        (extras.prev as unknown as { totalRefund?: number }).totalRefund,
      extras.prev.totalRefundFen != null ? 1 : 100
    );
    const prevGmvFen = prevGrossGmvFen - prevRefundFen;
    const prevOrders = extras.prev.paidOrderCount ?? 0;
    const prevAov = prevOrders > 0 ? Number(prevGmvFen) / 100 / prevOrders : 0;
    const prevRefundRate = rateByCount(Number(extras.prev.refundCount ?? 0), prevOrders);
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
    date: dmRow.date,
    totalGmv: Number(totalGmvFen) / 100,
    monthGmv: Number(monthGmvFen) / 100,
    totalGmvFen,
    gmvOnlineFen: netParts.onlineFen,
    gmvWalletFen: netParts.walletFen,
    gmvBonusFen: dmRow.gmvBonusFen,
    gmvCardFen: dmRow.gmvCardFen,
    totalRefundFen: dmRow.totalRefundFen,
    refundRate,
    refundOrderCount: Number(dmRow.refundCount),
    verifyOrderCount: Number(dmRow.verifyCount),
    totalVerifyFen: dmRow.totalVerifyFen,
    verifyRate,
    paidOrderCount,
    paidAmountBonusFen: dmRow.paidAmountBonusFen,
    paidAmountWalletFen: dmRow.paidAmountWalletFen,
    avgOrderValue,
    monthGmvFen,
    monthGmvOnlineFen,
    monthGmvWalletFen,
    compare,
    updatedAt: dmRow.updatedAt.toISOString(),
    dataSource: 'DailyMetrics'
  };
}

function ratioDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
