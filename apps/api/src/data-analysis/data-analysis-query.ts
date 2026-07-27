/** OrderHeader-based aggregates for 砍价订单 data-analysis export. */
import { shiftDateKey } from '@content/shared';
import { maskPhone as maskPhonePii, sqlDatetimeExclusiveRange } from '../common';
import type { PrismaService } from '../prisma/prisma.service';
import {
  DATA_ANALYSIS_TARGET_AMOUNT,
  type DataAnalysisChannelSlice,
  type DataAnalysisDailyPoint,
  type DataAnalysisDeltas,
  type DataAnalysisHourlyRow,
  type DataAnalysisOrderDetailRow,
  type DataAnalysisOverview,
  type DataAnalysisPackageRankRow,
  type DataAnalysisRankRow,
  type DataAnalysisRateRow,
  type DataAnalysisRefundRow,
  type DataAnalysisTimeSlotRow
} from './data-analysis.dto';
import { paidTimeBounds } from './data-analysis-window';

type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

const PAID_WHERE = sqlDatetimeExclusiveRange('"paidTime"');
const BEIJING_HOUR = `CAST(strftime('%H', datetime(replace(replace("paidTime", 'T', ' '), 'Z', ''), '+8 hours')) AS INTEGER)`;

/** Verified if status is verified OR verifyTime is present. */
const IS_VERIFIED = `("status" = 'verified' OR "verifyTime" IS NOT NULL)`;
const IS_REFUNDED = `("status" = 'refunded' OR COALESCE("refundAmount", 0) > 0)`;
/** Best-effort: cancelled without refund treated as expired-like. */
const IS_EXPIRED = `("status" = 'cancelled' AND COALESCE("refundAmount", 0) = 0 AND "verifyTime" IS NULL)`;

const SALESMAN_NAME = `COALESCE(NULLIF(TRIM("salesman"), ''), '（未命名业务员）')`;
const MERCHANT_NAME = `COALESCE(NULLIF(TRIM("merchantName"), ''), '（未命名商家）')`;
/** Beijing calendar date from paidTime (space or ISO form). */
const BEIJING_DATE = `date(datetime(replace(replace("paidTime", 'T', ' '), 'Z', ''), '+8 hours'))`;
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

const TIME_SLOTS: Array<{ label: string; startH: number; endH: number }> = [
  { label: '凌晨 0-6', startH: 0, endH: 6 },
  { label: '早间 6-9', startH: 6, endH: 9 },
  { label: '上午 9-12', startH: 9, endH: 12 },
  { label: '午间 12-14', startH: 12, endH: 14 },
  { label: '下午 14-17', startH: 14, endH: 17 },
  { label: '傍晚 17-19', startH: 17, endH: 19 },
  { label: '晚间 19-22', startH: 19, endH: 22 },
  { label: '深夜 22-24', startH: 22, endH: 24 }
];

function n(v: number | null | undefined): number {
  return Number(v ?? 0);
}

function rate(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

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
    netSales: deltaRatio(curr.netSales, prev.netSales),
    refundAmount: deltaRatio(curr.refundAmount, prev.refundAmount),
    verifyRate: deltaRatio(curr.verifyRate, prev.verifyRate),
    refundRate: deltaRatio(curr.refundRate, prev.refundRate),
    settlementRate: deltaRatio(curr.settlementRate, prev.settlementRate),
    avgOrderValue: deltaRatio(curr.avgOrderValue, prev.avgOrderValue)
  };
}

function channelLabel(key: string): string {
  const k = key.trim().toLowerCase();
  return CHANNEL_LABELS[k] ?? (k ? key : '其他');
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
       COALESCE(SUM("paidAmount"), 0) AS "salesAmount",
       COALESCE(SUM("paidAmountWallet"), 0) AS "walletAmount",
       COALESCE(SUM("orderAmount"), 0) AS "faceAmount",
       COALESCE(SUM("refundAmount"), 0) AS "refundAmount",
       COALESCE(SUM("verifyAmount"), 0) AS "verifyAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount",
       COALESCE(SUM(CASE WHEN ${IS_EXPIRED} THEN 1 ELSE 0 END), 0) AS "expiredCount",
       COUNT(DISTINCT NULLIF(TRIM("merchantName"), '')) AS "merchantCount",
       COUNT(DISTINCT NULLIF(TRIM("salesman"), '')) AS "salesmanCount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}`,
    startBound,
    endBound
  )) as Array<{
    orderCount: number | null;
    salesAmount: number | null;
    walletAmount: number | null;
    faceAmount: number | null;
    refundAmount: number | null;
    verifyAmount: number | null;
    verifiedCount: number | null;
    expiredCount: number | null;
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
  const pendingVerifyCount = Math.max(0, orderCount - verifiedCount - expiredCount);
  const tradeAmount = salesAmount + walletAmount;
  const target = DATA_ANALYSIS_TARGET_AMOUNT;

  return {
    orderCount,
    salesAmount,
    walletAmount,
    tradeAmount,
    netSales: salesAmount - refundAmount,
    faceAmount: n(r?.faceAmount),
    refundAmount,
    verifyAmount,
    verifyRate: rate(verifiedCount, orderCount),
    refundRate: rate(refundAmount, salesAmount),
    // verifyAmount = settledAmount (paid + wallet) on verified orders, so
    // denominator must be tradeAmount (same unit). Using salesAmount alone
    // inflates the rate above 100% whenever wallet deduction is non-zero.
    settlementRate: rate(verifyAmount, tradeAmount),
    avgOrderValue: rate(salesAmount, orderCount),
    targetRatio: rate(salesAmount, target),
    targetRatioWithWallet: rate(tradeAmount, target),
    verifiedCount,
    pendingVerifyCount,
    expiredCount,
    merchantCount: n(r?.merchantCount),
    salesmanCount: n(r?.salesmanCount)
  };
}

/** Daily series over [startDate, endDate] (inclusive), filled for missing days. */
export async function queryDailyTrend(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisDailyPoint[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${BEIJING_DATE} AS "date",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmount"), 0) AS "salesAmount",
       COALESCE(SUM("paidAmountWallet"), 0) AS "walletAmount",
       COALESCE(SUM("refundAmount"), 0) AS "refundAmount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}
     GROUP BY ${BEIJING_DATE}
     ORDER BY "date" ASC`,
    startBound,
    endBound
  )) as Array<{
    date: string | null;
    orderCount: number | null;
    salesAmount: number | null;
    walletAmount: number | null;
    refundAmount: number | null;
  }>;

  const byDate = new Map<string, DataAnalysisDailyPoint>();
  for (const row of rows) {
    const date = String(row.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const salesAmount = n(row.salesAmount);
    const walletAmount = n(row.walletAmount);
    const refundAmount = n(row.refundAmount);
    byDate.set(date, {
      date,
      salesAmount,
      tradeAmount: salesAmount + walletAmount,
      netSales: salesAmount - refundAmount,
      orderCount: n(row.orderCount),
      refundAmount
    });
  }

  // Fill every day so the line chart axis is continuous.
  const points: DataAnalysisDailyPoint[] = [];
  let cursor = startDate;
  // Guard against pathological spans (service already caps at 90d).
  for (let i = 0; i < 120; i++) {
    const hit = byDate.get(cursor);
    points.push(
      hit ?? {
        date: cursor,
        salesAmount: 0,
        tradeAmount: 0,
        netSales: 0,
        orderCount: 0,
        refundAmount: 0
      }
    );
    if (cursor === endDate) break;
    cursor = shiftDateKey(cursor, 1);
    if (cursor > endDate) break;
  }
  return points;
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
       COALESCE(SUM("paidAmount"), 0) AS "salesAmount"
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

/**
 * Human label for a package rank row.
 * Never surface raw numeric packageIds — those look like "default placeholders"
 * in the TOP 5 UI when ContentPackage is missing a row (common for fresh JeeSite SKUs).
 */
export function resolvePackageDisplayName(
  packageName: string | null | undefined,
  packageId: string | null | undefined,
  merchantName?: string | null
): string {
  const id = (packageId ?? '').trim();
  const name = (packageName ?? '').trim();
  // Accept a real title only when it is non-empty and not just the id / a bare snowflake.
  if (name && name !== id && !/^\d{12,}$/.test(name)) return name;
  const merchant = (merchantName ?? '').trim();
  if (merchant) return `${merchant} · 套餐未同步`;
  return '（未命名商品）';
}

type PackageIdAggRow = {
  packageId: string | null;
  packageName: string | null;
  merchantName: string | null;
  orderCount: number | null;
  salesAmount: number | null;
};

/**
 * Collapse per-packageId aggregates into per-display-name ranks.
 * JeeSite re-lists the same product under many packageIds; ranking by id
 * fills TOP 5 with duplicate titles. Operators expect one row per product name.
 */
export function mergePackageRankingByName(
  rows: PackageIdAggRow[],
  limit: number
): DataAnalysisPackageRankRow[] {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 5));
  type Acc = {
    packageId: string;
    packageName: string;
    salesAmount: number;
    orderCount: number;
    /** sales of the representative packageId (highest within the name group). */
    leadSales: number;
  };
  const byName = new Map<string, Acc>();

  for (const r of rows) {
    const packageId = r.packageId?.trim() || '';
    const salesAmount = n(r.salesAmount);
    const orderCount = n(r.orderCount);
    const packageName = resolvePackageDisplayName(r.packageName, packageId, r.merchantName);
    const prev = byName.get(packageName);
    if (!prev) {
      byName.set(packageName, {
        packageId,
        packageName,
        salesAmount,
        orderCount,
        leadSales: salesAmount
      });
      continue;
    }
    prev.salesAmount += salesAmount;
    prev.orderCount += orderCount;
    // Keep the packageId that contributes the most sales as the representative id.
    if (
      salesAmount > prev.leadSales ||
      (salesAmount === prev.leadSales && packageId < prev.packageId)
    ) {
      prev.packageId = packageId;
      prev.leadSales = salesAmount;
    }
  }

  return [...byName.values()]
    .sort(
      (a, b) =>
        b.salesAmount - a.salesAmount ||
        b.orderCount - a.orderCount ||
        a.packageName.localeCompare(b.packageName, 'zh')
    )
    .slice(0, safeLimit)
    .map((r, i) => ({
      rank: i + 1,
      packageId: r.packageId,
      packageName: r.packageName,
      // Money is yuan; keep 2dp after multi-id sum (avoids 0.1+0.2 float noise).
      salesAmount: Math.round(r.salesAmount * 100) / 100,
      orderCount: r.orderCount
    }));
}

export async function queryPackageRanking(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit = 5
): Promise<DataAnalysisPackageRankRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 5));
  // Fetch a wider packageId window so same-name SKUs can collapse into TOP N.
  // 40× covers heavy re-list churn (e.g. 19+ ids per 悦得闲 title) without full scan.
  const fetchLimit = Math.min(500, Math.max(safeLimit * 40, safeLimit));
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       COALESCE(NULLIF(TRIM(oh."packageId"), ''), '') AS "packageId",
       NULLIF(TRIM(cp."packageName"), '') AS "packageName",
       NULLIF(TRIM(MAX(oh."merchantName")), '') AS "merchantName",
       COUNT(*) AS "orderCount",
       COALESCE(SUM(oh."paidAmount"), 0) AS "salesAmount"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     GROUP BY oh."packageId", cp."packageName"
     ORDER BY "salesAmount" DESC, "orderCount" DESC
     LIMIT ?`,
    startBound,
    endBound,
    fetchLimit
  )) as PackageIdAggRow[];

  return mergePackageRankingByName(rows, safeLimit);
}

export async function queryTimeSlots(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisTimeSlotRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${BEIJING_HOUR} AS "hour",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmount"), 0) AS "salesAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}
     GROUP BY ${BEIJING_HOUR}`,
    startBound,
    endBound
  )) as Array<{
    hour: number | null;
    orderCount: number | null;
    salesAmount: number | null;
    verifiedCount: number | null;
  }>;

  const byHour = new Map<
    number,
    { orderCount: number; salesAmount: number; verifiedCount: number }
  >();
  for (const row of rows) {
    const hour = n(row.hour);
    if (hour < 0 || hour > 23) continue;
    byHour.set(hour, {
      orderCount: n(row.orderCount),
      salesAmount: n(row.salesAmount),
      verifiedCount: n(row.verifiedCount)
    });
  }

  return TIME_SLOTS.map((slot) => {
    let orderCount = 0;
    let salesAmount = 0;
    let verifiedCount = 0;
    for (let h = slot.startH; h < slot.endH; h++) {
      const cell = byHour.get(h);
      if (!cell) continue;
      orderCount += cell.orderCount;
      salesAmount += cell.salesAmount;
      verifiedCount += cell.verifiedCount;
    }
    return {
      label: slot.label,
      orderCount,
      salesAmount,
      verifiedCount,
      verifyRate: rate(verifiedCount, orderCount)
    };
  });
}

export async function queryHourly(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<DataAnalysisHourlyRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${BEIJING_HOUR} AS "hour",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmount"), 0) AS "salesAmount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE}
     GROUP BY ${BEIJING_HOUR}
     HAVING COUNT(*) > 0
     ORDER BY "hour" ASC`,
    startBound,
    endBound
  )) as Array<{ hour: number | null; orderCount: number | null; salesAmount: number | null }>;

  return rows
    .map((r) => ({
      hour: n(r.hour),
      orderCount: n(r.orderCount),
      salesAmount: n(r.salesAmount)
    }))
    .filter((r) => r.hour >= 0 && r.hour <= 23);
}

type RankSqlRow = {
  name: string | null;
  orderCount: number | null;
  salesAmount: number | null;
  faceAmount: number | null;
  walletAmount: number | null;
  refundAmount: number | null;
  verifiedCount: number | null;
};

function mapRankRows(rows: RankSqlRow[], emptyLabel: string): DataAnalysisRankRow[] {
  return rows.map((r, i) => {
    const orderCount = n(r.orderCount);
    const salesAmount = n(r.salesAmount);
    const verifiedCount = n(r.verifiedCount);
    return {
      rank: i + 1,
      name: r.name?.trim() || emptyLabel,
      orderCount,
      salesAmount,
      faceAmount: n(r.faceAmount),
      walletAmount: n(r.walletAmount),
      refundAmount: n(r.refundAmount),
      verifiedCount,
      verifyRate: rate(verifiedCount, orderCount),
      avgOrderValue: rate(salesAmount, orderCount)
    };
  });
}

async function queryRankingBy(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number,
  groupExpr: string,
  emptyLabel: string,
  /** When true, only rows with a non-empty raw name (skip pure placeholder groups). */
  requireNamed = false
): Promise<DataAnalysisRankRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const namedFilter = requireNamed
    ? `AND NULLIF(TRIM(COALESCE("salesman", '')), '') IS NOT NULL`
    : '';
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${groupExpr} AS "name",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("paidAmount"), 0) AS "salesAmount",
       COALESCE(SUM("orderAmount"), 0) AS "faceAmount",
       COALESCE(SUM("paidAmountWallet"), 0) AS "walletAmount",
       COALESCE(SUM("refundAmount"), 0) AS "refundAmount",
       COALESCE(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END), 0) AS "verifiedCount"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE} ${namedFilter}
     GROUP BY ${groupExpr}
     ORDER BY "salesAmount" DESC, "orderCount" DESC, "name" ASC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as RankSqlRow[];
  return mapRankRows(rows, emptyLabel);
}

export async function queryMerchantRanking(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRankRow[]> {
  return queryRankingBy(prisma, startDate, endDate, limit, MERCHANT_NAME, '（未命名商家）');
}

export async function querySalesmanRanking(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRankRow[]> {
  return queryRankingBy(prisma, startDate, endDate, limit, SALESMAN_NAME, '（未命名业务员）', true);
}

async function queryVerifyExtremesBy(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  minOrders: number,
  limit: number,
  groupExpr: string,
  requireNamed = false
): Promise<{ low: DataAnalysisRateRow[]; high: DataAnalysisRateRow[] }> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const namedFilter = requireNamed
    ? `AND NULLIF(TRIM(COALESCE("salesman", '')), '') IS NOT NULL`
    : '';
  const base = `
    SELECT
      ${groupExpr} AS "name",
      COUNT(*) AS "orderCount",
      CAST(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS "verifyRate"
    FROM "OrderHeader"
    WHERE ${PAID_WHERE} ${namedFilter}
    GROUP BY ${groupExpr}
    HAVING COUNT(*) >= ?
  `;
  const low = (await prisma.$queryRawUnsafe(
    `${base} ORDER BY "verifyRate" ASC, "orderCount" DESC, "name" ASC LIMIT ?`,
    startBound,
    endBound,
    minOrders,
    limit
  )) as Array<{ name: string; orderCount: number; verifyRate: number }>;
  const high = (await prisma.$queryRawUnsafe(
    `${base} ORDER BY "verifyRate" DESC, "orderCount" DESC, "name" ASC LIMIT ?`,
    startBound,
    endBound,
    minOrders,
    limit
  )) as Array<{ name: string; orderCount: number; verifyRate: number }>;

  const map = (rows: typeof low): DataAnalysisRateRow[] =>
    rows.map((r) => ({
      name: r.name,
      orderCount: n(r.orderCount),
      verifyRate: n(r.verifyRate)
    }));
  return { low: map(low), high: map(high) };
}

export async function queryMerchantVerifyExtremes(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  minOrders: number,
  limit: number
): Promise<{ low: DataAnalysisRateRow[]; high: DataAnalysisRateRow[] }> {
  return queryVerifyExtremesBy(prisma, startDate, endDate, minOrders, limit, MERCHANT_NAME);
}

export async function querySalesmanVerifyExtremes(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  minOrders: number,
  limit: number
): Promise<{ low: DataAnalysisRateRow[]; high: DataAnalysisRateRow[] }> {
  return queryVerifyExtremesBy(prisma, startDate, endDate, minOrders, limit, SALESMAN_NAME, true);
}

async function queryRefundsBy(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number,
  groupExpr: string,
  requireNamed = false
): Promise<DataAnalysisRefundRow[]> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const namedFilter = requireNamed
    ? `AND NULLIF(TRIM(COALESCE("salesman", '')), '') IS NOT NULL`
    : '';
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       ${groupExpr} AS "name",
       COUNT(*) AS "orderCount",
       COALESCE(SUM("refundAmount"), 0) AS "refundAmount",
       CAST(SUM(CASE WHEN ${IS_VERIFIED} THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS "verifyRate"
     FROM "OrderHeader"
     WHERE ${PAID_WHERE} AND COALESCE("refundAmount", 0) > 0 ${namedFilter}
     GROUP BY ${groupExpr}
     ORDER BY "refundAmount" DESC, "orderCount" DESC, "name" ASC
     LIMIT ?`,
    startBound,
    endBound,
    limit
  )) as Array<{
    name: string;
    orderCount: number;
    refundAmount: number;
    verifyRate: number;
  }>;

  return rows.map((r) => ({
    name: r.name,
    orderCount: n(r.orderCount),
    refundAmount: n(r.refundAmount),
    verifyRate: n(r.verifyRate)
  }));
}

export async function queryMerchantRefunds(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRefundRow[]> {
  return queryRefundsBy(prisma, startDate, endDate, limit, MERCHANT_NAME);
}

export async function querySalesmanRefunds(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<DataAnalysisRefundRow[]> {
  return queryRefundsBy(prisma, startDate, endDate, limit, SALESMAN_NAME, true);
}

type DetailSqlRow = {
  merchantName: string | null;
  orderId: string;
  orderCode: string | null;
  packageName: string | null;
  memberNickname: string | null;
  memberPhone: string | null;
  paidAmount: number | null;
  orderAmount: number | null;
  walletAmount: number | null;
  pointUsed: number | null;
  refundAmount: number | null;
  coupon: string | null;
  salesman: string | null;
  parentSalesman: string | null;
  status: string | null;
  paidTime: string | null;
  verifyTime: string | null;
};

/** Prefer platform maskPhone — short / foreign phones must never leak raw. */
function maskMemberPhone(phone: string | null | undefined): string {
  return maskPhonePii(phone) ?? '';
}

function statusLabel(status: string | null | undefined, verifyTime: string | null): string {
  if (status === 'refunded') return '已退款';
  if (status === 'verified' || verifyTime) return '待评价';
  if (status === 'paid') return '已发货';
  if (status === 'cancelled') return '已取消';
  return status || '';
}

function verifyLabel(status: string | null | undefined, verifyTime: string | null): string {
  if (status === 'verified' || verifyTime) return '已核销';
  if (status === 'cancelled') return '已过期';
  if (status === 'refunded') return '已退款';
  return '待核销';
}

function fmtTime(v: string | null | undefined): string {
  if (!v) return '';
  // Normalize ISO / space form to "YYYY-MM-DD HH:MM:SS"
  const s = String(v)
    .replace('T', ' ')
    .replace(/Z$/, '')
    .replace(/\.\d+$/, '');
  return s.length >= 19 ? s.slice(0, 19) : s;
}

export async function queryOrderDetails(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<{ rows: DataAnalysisOrderDetailRow[]; truncated: boolean }> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       oh."merchantName" AS "merchantName",
       oh."orderId" AS "orderId",
       oh."orderCode" AS "orderCode",
       cp."packageName" AS "packageName",
       m."nickname" AS "memberNickname",
       m."phone" AS "memberPhone",
       oh."paidAmount" AS "paidAmount",
       oh."orderAmount" AS "orderAmount",
       oh."paidAmountWallet" AS "walletAmount",
       oh."pointUsed" AS "pointUsed",
       oh."refundAmount" AS "refundAmount",
       oh."coupon" AS "coupon",
       oh."salesman" AS "salesman",
       oh."parentSalesman" AS "parentSalesman",
       oh."status" AS "status",
       oh."paidTime" AS "paidTime",
       oh."verifyTime" AS "verifyTime"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     LEFT JOIN "Member" m ON m."memberId" = oh."memberId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     ORDER BY oh."paidTime" ASC, oh."orderId" ASC
     LIMIT ?`,
    startBound,
    endBound,
    limit + 1
  )) as DetailSqlRow[];

  const truncated = rows.length > limit;
  const slice = truncated ? rows.slice(0, limit) : rows;

  return {
    truncated,
    rows: slice.map((r) => ({
      merchantName: r.merchantName ?? '',
      // Prefer JeSite 展示单号 when present (matches template 订单编号)
      orderId: r.orderCode?.trim() || r.orderId,
      packageName: r.packageName ?? '',
      // Prefer masked phone; never fall back to raw nickname when phone is present-but-short.
      // Nickname alone is still exported (ops matching) — no phone digits.
      memberLabel: maskMemberPhone(r.memberPhone) || (r.memberNickname?.trim() ?? ''),
      paidAmount: n(r.paidAmount),
      orderAmount: n(r.orderAmount),
      walletAmount: n(r.walletAmount),
      pointUsed: n(r.pointUsed),
      refundAmount: n(r.refundAmount),
      coupon: r.coupon?.trim() || '',
      salesman: r.salesman?.trim() || '',
      parentSalesman: r.parentSalesman?.trim() || '',
      statusLabel: statusLabel(r.status, r.verifyTime),
      orderType: '虚拟卡券',
      verifyLabel: verifyLabel(r.status, r.verifyTime),
      paidTime: fmtTime(r.paidTime),
      verifyTime: fmtTime(r.verifyTime)
    }))
  };
}
