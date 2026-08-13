/** Overview aggregates and channel breakdown for the 砍价订单 data-analysis report. */
import { sqlDatetimeExclusiveRange } from '../common';
import {
  DATA_ANALYSIS_TARGET_AMOUNT,
  type DataAnalysisChannelSlice,
  type DataAnalysisDeltas,
  type DataAnalysisOverview
} from './data-analysis.dto';
import { paidTimeBounds } from './data-analysis-window';
import {
  IS_EXPIRED,
  IS_PENDING_VERIFY,
  IS_VERIFIED,
  PAID_WHERE,
  type PrismaLike,
  REFUND_AMOUNT_FEN,
  n,
  rate,
  rateByCount
} from './data-analysis-query.shared';

/** Qualified paidTime range for the refund subquery in queryOverview. */
const REFUND_PAID_WHERE = sqlDatetimeExclusiveRange('r."paidTime"');
const CHANNEL_KEY = `COALESCE(NULLIF(TRIM("channel"), ''), 'other')`;

/** Map stored channel keys → display labels used by the dashboard donut. */
const CHANNEL_LABELS: Record<string, string> = {
  wechat: '微信小程序',
  wechat_mini: '微信小程序',
  wechat_mp: '微信小程序',
  wx: '微信小程序',
  alipay: '支付宝小程序',
  alipay_mini: '支付宝小程序',
  h5: 'H5',
  offline: '线下核销',
  offline_verify: '线下核销',
  jeesite: '其他',
  other: '其他'
};

/** (curr − prev) / prev; null when previous is zero so UI can show "—". */
export function deltaRatio(curr: number, prev: number): number | null {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return null;
  return (curr - prev) / prev;
}

export function buildDeltas(
  curr: DataAnalysisOverview,
  prev: DataAnalysisOverview
): DataAnalysisDeltas {
  return {
    orderCount: deltaRatio(curr.orderCount, prev.orderCount),
    salesAmount: deltaRatio(curr.salesAmount, prev.salesAmount),
    tradeAmount: deltaRatio(curr.tradeAmount, prev.tradeAmount),
    netGmv: deltaRatio(curr.netGmv, prev.netGmv),
    writeOffAmount: deltaRatio(curr.writeOffAmount, prev.writeOffAmount),
    refundAmount: deltaRatio(curr.refundAmount, prev.refundAmount),
    verifyRate: deltaRatio(curr.verifyRate, prev.verifyRate),
    refundRate: deltaRatio(curr.refundRate, prev.refundRate),
    settlementRate: deltaRatio(curr.settlementRate, prev.settlementRate),
    avgOrderValue: deltaRatio(curr.avgOrderValue, prev.avgOrderValue)
  };
}

export async function queryOverview(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisOverview> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmountFen") / 100.0, 0) AS "salesAmount",
       COALESCE(SUM("paidAmountWalletFen") / 100.0, 0) AS "walletAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN "paidAmountFen" + "paidAmountWalletFen" ELSE 0 END) / 100.0, 0) AS "writeOffAmount",
       COALESCE(SUM("orderAmountFen") / 100.0, 0) AS "faceAmount",
       (SELECT COALESCE(SUM(${REFUND_AMOUNT_FEN('r.')}) / 100.0, 0) FROM "OrderHeader" r WHERE ${REFUND_PAID_WHERE} AND r."refundAmountFen" > 0) AS "refundAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN "verifyAmountFen" ELSE 0 END) / 100.0, 0) AS "verifyAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount",
       COALESCE(SUM(CASE WHEN ${IS_EXPIRED} THEN 1 ELSE 0 END), 0) AS "expiredCount",
       COALESCE(SUM(CASE WHEN ${IS_PENDING_VERIFY} THEN 1 ELSE 0 END), 0) AS "pendingVerifyCount",
       COALESCE(SUM(CASE WHEN "refundAmountFen" > 0 THEN 1 ELSE 0 END), 0) AS "refundCount",
       COUNT(DISTINCT NULLIF(TRIM("merchantName"), '')) AS "merchantCount",
       COUNT(DISTINCT NULLIF(TRIM("salesman"), '')) AS "salesmanCount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}`,
    startBound,
    endBound,
    startBound,
    endBound
  )) as Array<{
    orderCount: number | null;
    salesAmount: number | null;
    walletAmount: number | null;
    writeOffAmount: number | null;
    faceAmount: number | null;
    refundAmount: number | null;
    verifyAmount: number | null;
    verifiedCount: number | null;
    expiredCount: number | null;
    pendingVerifyCount: number | null;
    refundCount: number | null;
    merchantCount: number | null;
    salesmanCount: number | null;
  }>;

  const r = rows[0];
  const orderCount = n(r?.orderCount);
  const salesAmount = n(r?.salesAmount);
  const walletAmount = n(r?.walletAmount);
  const refundAmount = n(r?.refundAmount);
  const verifyAmount = n(r?.verifyAmount);
  const verifiedCount = n(r?.verifiedCount);
  const expiredCount = n(r?.expiredCount);
  const refundCount = n(r?.refundCount);
  const pendingVerifyCount = n(r?.pendingVerifyCount);
  const tradeAmount = salesAmount + walletAmount;
  const netGmv = tradeAmount - refundAmount;
  const target = DATA_ANALYSIS_TARGET_AMOUNT;

  return {
    orderCount,
    salesAmount,
    walletAmount,
    tradeAmount,
    netGmv,
    writeOffAmount: n(r?.writeOffAmount),
    faceAmount: n(r?.faceAmount),
    refundAmount,
    verifyAmount,
    verifyRate: rateByCount(verifiedCount, orderCount),
    // 单数口径: 退款率 = 退款单数 / 总订单数 (不再用金额 refundAmount/salesAmount).
    refundRate: rateByCount(refundCount, orderCount),
    // verifyAmount = settledAmount (paid + wallet) on verified orders, so
    // denominator must be the gross tradeAmount (same unit). Using salesAmount alone
    // inflates the rate above 100% whenever wallet deduction is non-zero.
    settlementRate: rate(verifyAmount, tradeAmount),
    avgOrderValue: rate(netGmv, orderCount),
    targetRatio: rate(salesAmount, target),
    targetRatioWithWallet: rate(tradeAmount, target),
    netGmvTargetRatio: rate(netGmv, target),
    verifiedCount,
    refundCount,
    pendingVerifyCount,
    expiredCount,
    merchantCount: n(r?.merchantCount),
    salesmanCount: n(r?.salesmanCount)
  };
}

function channelLabel(key: string): string {
  const k = key.trim().toLowerCase();
  return CHANNEL_LABELS[k] ?? (k ? key : '其他');
}

export async function queryChannelBreakdown(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisChannelSlice[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${CHANNEL_KEY} AS "channel",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmountFen") / 100.0, 0) AS "salesAmount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}
     GROUP BY ${CHANNEL_KEY}
     ORDER BY "salesAmount" DESC, "orderCount" DESC`,
    startBound,
    endBound
  )) as Array<{ channel: string | null; orderCount: number | null; salesAmount: number | null }>;

  // Collapse synonymous channel keys into display labels before ranking.
  const merged = new Map<
    string,
    { channel: string; label: string; salesAmount: number; orderCount: number }
  >();
  for (const row of rows) {
    const raw = String(row.channel ?? 'other');
    const label = channelLabel(raw);
    const key = label;
    const prev = merged.get(key);
    const salesAmount = n(row.salesAmount);
    const orderCount = n(row.orderCount);
    if (prev) {
      prev.salesAmount += salesAmount;
      prev.orderCount += orderCount;
    } else {
      merged.set(key, { channel: raw.toLowerCase(), label, salesAmount, orderCount });
    }
  }

  const list = [...merged.values()].sort(
    (a, b) => b.salesAmount - a.salesAmount || b.orderCount - a.orderCount
  );
  const total = list.reduce((s, x) => s + x.salesAmount, 0);

  // Keep top 4 + fold rest into 其他 so the donut stays readable.
  const TOP = 4;
  if (list.length <= TOP + 1) {
    return list.map((x) => ({
      channel: x.channel,
      label: x.label,
      salesAmount: x.salesAmount,
      orderCount: x.orderCount,
      share: rate(x.salesAmount, total)
    }));
  }

  const head = list.slice(0, TOP);
  const tail = list.slice(TOP);
  const other = {
    channel: 'other',
    label: '其他',
    salesAmount: tail.reduce((s, x) => s + x.salesAmount, 0),
    orderCount: tail.reduce((s, x) => s + x.orderCount, 0)
  };
  // If head already has 其他, merge into it.
  const otherIdx = head.findIndex((x) => x.label === '其他');
  if (otherIdx >= 0) {
    head[otherIdx].salesAmount += other.salesAmount;
    head[otherIdx].orderCount += other.orderCount;
    return head.map((x) => ({
      channel: x.channel,
      label: x.label,
      salesAmount: x.salesAmount,
      orderCount: x.orderCount,
      share: rate(x.salesAmount, total)
    }));
  }
  return [...head, other].map((x) => ({
    channel: x.channel,
    label: x.label,
    salesAmount: x.salesAmount,
    orderCount: x.orderCount,
    share: rate(x.salesAmount, total)
  }));
}
