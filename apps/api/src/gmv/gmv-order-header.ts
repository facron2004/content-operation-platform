/** Consolidated GMV module. */
import { beijingDateKey, beijingDayRangeUtc, shiftDateKey } from '@content/shared';
import { gmvFromParts, rateAgainstGmv, SQL_GMV_OH } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { mapDistributionRows } from './gmv-metrics';
import {
  emptyHourlyPoints,
  emptyTrendPoint,
  type GmvDistributionRow,
  type GmvHourlyPoint,
  type GmvTodayPayload,
  type GmvTrendPoint
} from './gmv.dto';

// --- gmv-order-header-fields.ts ---
export type OrderLike = {
  orderId?: string | null;
  memberId?: string | null;
  packageId?: string | null;
  merchantId?: string | null;
  merchantName?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  orderTime: string | Date;
  paidTime?: string | Date | null;
  verifyTime?: string | Date | null;
  refundTime?: string | Date | null;
  orderAmount: number;
  paidAmount: number;
  paidAmountWallet: number;
  paidAmountBonus: number;
  refundAmount?: number | null;
  verifyAmount?: number | null;
  pointEarned?: number | null;
  pointUsed?: number | null;
  status: string;
};
/** Normalize any Date/string/number into UTC ISO text. Prisma+sqlite DateTime
 *  writes as integer epoch ms, which breaks our ISO-string day-range SQL
 *  (`paidTime >= '2026-07-17T16:00:00.000Z'`). Always store ISO text via raw SQL. */
export function toIsoText(value: string | Date | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toOrderHeaderSharedFields(o: OrderLike) {
  return {
    memberId: o.memberId || null,
    packageId: o.packageId || null,
    merchantId: o.merchantId || null,
    merchantName: o.merchantName || null,
    areaId: o.areaId || null,
    areaName: o.areaName || null,
    orderTime: toIsoText(o.orderTime)!,
    paidTime: toIsoText(o.paidTime ?? null),
    verifyTime: toIsoText(o.verifyTime ?? null),
    refundTime: toIsoText(o.refundTime ?? null),
    orderAmount: o.orderAmount,
    paidAmount: o.paidAmount,
    paidAmountWallet: o.paidAmountWallet,
    paidAmountBonus: o.paidAmountBonus,
    refundAmount: o.refundAmount ?? 0,
    verifyAmount: o.verifyAmount ?? 0,
    status: o.status
  };
}

// --- gmv-order-header-payload.ts ---
export function toOrderHeaderCreate(o: OrderLike) {
  return {
    orderId: o.orderId!,
    ...toOrderHeaderSharedFields(o),
    paidAmountCard: 0,
    pointEarned: o.pointEarned ?? 0,
    pointUsed: o.pointUsed ?? 0,
    channel: 'jeesite'
  };
}
export function toOrderHeaderUpdate(o: OrderLike) {
  return toOrderHeaderSharedFields(o);
}

/**
 * Upsert OrderHeader with ISO-text DateTimes via raw SQL.
 * Avoids Prisma client DateTime → integer epoch storage that breaks ISO compares.
 */
export async function upsertOrderHeaderIso(
  prisma: Pick<PrismaService, '$executeRawUnsafe'>,
  o: OrderLike
): Promise<void> {
  if (!o.orderId) throw new Error('upsertOrderHeaderIso: orderId required');
  const fields = toOrderHeaderSharedFields(o);
  const nowIso = new Date().toISOString();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderHeader" (
        "orderId", "memberId", "packageId", "merchantId", "merchantName",
        "areaId", "areaName", "orderTime", "paidTime", "verifyTime", "refundTime",
        "orderAmount", "paidAmount", "paidAmountWallet", "paidAmountBonus", "paidAmountCard",
        "refundAmount", "verifyAmount", "pointEarned", "pointUsed", "status", "channel",
        "createdAt", "updatedAt"
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'jeesite', ?, ?)
     ON CONFLICT("orderId") DO UPDATE SET
        "memberId"=excluded."memberId",
        "packageId"=excluded."packageId",
        "merchantId"=excluded."merchantId",
        "merchantName"=excluded."merchantName",
        "areaId"=excluded."areaId",
        "areaName"=excluded."areaName",
        "orderTime"=excluded."orderTime",
        "paidTime"=excluded."paidTime",
        "verifyTime"=excluded."verifyTime",
        "refundTime"=excluded."refundTime",
        "orderAmount"=excluded."orderAmount",
        "paidAmount"=excluded."paidAmount",
        "paidAmountWallet"=excluded."paidAmountWallet",
        "paidAmountBonus"=excluded."paidAmountBonus",
        "refundAmount"=excluded."refundAmount",
        "verifyAmount"=excluded."verifyAmount",
        "pointEarned"=excluded."pointEarned",
        "pointUsed"=excluded."pointUsed",
        "status"=excluded."status",
        "channel"=excluded."channel",
        "updatedAt"=excluded."updatedAt"`,
    o.orderId,
    fields.memberId,
    fields.packageId,
    fields.merchantId,
    fields.merchantName,
    fields.areaId,
    fields.areaName,
    fields.orderTime,
    fields.paidTime,
    fields.verifyTime,
    fields.refundTime,
    fields.orderAmount,
    fields.paidAmount,
    fields.paidAmountWallet,
    fields.paidAmountBonus,
    fields.refundAmount,
    fields.verifyAmount,
    o.pointEarned ?? 0,
    o.pointUsed ?? 0,
    fields.status,
    nowIso,
    nowIso
  );
}

// --- gmv-order-header-today-sql.ts ---
type PrismaLike = Pick<PrismaService, '$queryRawUnsafe'>;

export async function queryOrderHeaderGmv(
  prisma: PrismaLike,
  startIso: string,
  endIso: string
): Promise<OrderHeaderGmvRow[]> {
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("paidAmount"), 0) AS "paidAmount",
            COALESCE(SUM("paidAmountWallet"), 0) AS "paidAmountWallet",
            COALESCE(SUM("paidAmountBonus"), 0) AS "paidAmountBonus",
            COALESCE(SUM("paidAmountCard"), 0) AS "paidAmountCard",
            COALESCE(SUM("verifyAmount"), 0) AS "verifyAmount",
            COUNT(*) AS "orderCount"
     FROM "OrderHeader"
     WHERE "paidTime" >= ? AND "paidTime" < ?`,
    startIso,
    endIso
  )) as OrderHeaderGmvRow[];
}

export async function queryOrderHeaderRefund(
  prisma: PrismaLike,
  startIso: string,
  endIso: string
): Promise<Array<{ totalRefund: number }>> {
  return (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("refundAmount"), 0) AS "totalRefund"
     FROM "OrderHeader"
     WHERE "refundTime" >= ? AND "refundTime" < ? AND "refundAmount" > 0`,
    startIso,
    endIso
  )) as Array<{ totalRefund: number }>;
}

export async function queryOrderHeaderHourly(
  prisma: PrismaLike,
  startIso: string,
  endIso: string
): Promise<GmvHourlyPoint[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT CAST(strftime('%H', datetime("paidTime", '+8 hours')) AS INTEGER) AS "hour",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv",
            COUNT(*) AS "paidOrderCount"
     FROM "OrderHeader"
     WHERE "paidTime" >= ? AND "paidTime" < ?
     GROUP BY strftime('%H', datetime("paidTime", '+8 hours'))
     ORDER BY "hour" ASC`,
    startIso,
    endIso
  )) as Array<{ hour: number; totalGmv: number; paidOrderCount: number }>;

  const base = emptyHourlyPoints();
  for (const row of rows) {
    const hour = Number(row.hour);
    if (hour >= 0 && hour <= 23) {
      base[hour] = {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        totalGmv: Number(row.totalGmv),
        paidOrderCount: Number(row.paidOrderCount)
      };
    }
  }
  return base;
}

// --- gmv-order-header-today-payload.ts ---
export type OrderHeaderGmvRow = {
  paidAmount: number;
  paidAmountWallet: number;
  paidAmountBonus: number;
  paidAmountCard: number;
  verifyAmount: number;
  orderCount: number;
};

export const EMPTY_ORDER_HEADER_GMV_ROW: OrderHeaderGmvRow = {
  paidAmount: 0,
  paidAmountWallet: 0,
  paidAmountBonus: 0,
  paidAmountCard: 0,
  verifyAmount: 0,
  orderCount: 0
};

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

// --- gmv-order-header-today.ts ---

export async function computeFromOrderHeader(
  prisma: PrismaLike,
  date: string
): Promise<GmvTodayPayload> {
  const { start: dayStart, end: dayEnd } = beijingDayRangeUtc(date);
  const startIso = dayStart.toISOString();
  const endIso = dayEnd.toISOString();
  const monthStart = `${date.slice(0, 7)}-01`;
  const { start: monthStartUtc } = beijingDayRangeUtc(monthStart);
  const prevDate = shiftDateKey(date, -1);
  const { start: prevStart, end: prevEnd } = beijingDayRangeUtc(prevDate);

  const [gmvRows, refundRows, monthRows, prevGmvRows, prevRefundRows] = await Promise.all([
    queryOrderHeaderGmv(prisma, startIso, endIso),
    queryOrderHeaderRefund(prisma, startIso, endIso),
    queryOrderHeaderGmv(prisma, monthStartUtc.toISOString(), endIso),
    queryOrderHeaderGmv(prisma, prevStart.toISOString(), prevEnd.toISOString()),
    queryOrderHeaderRefund(prisma, prevStart.toISOString(), prevEnd.toISOString())
  ]);

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
  const { start, end } = beijingDayRangeUtc(date);
  return queryOrderHeaderHourly(prisma, start.toISOString(), end.toISOString());
}

// --- gmv-order-header-trend-days.ts ---
export function countInclusiveDays(startDate: string, endDate: string): number {
  let count = 0;
  let cursor = startDate;
  while (cursor < endDate) {
    cursor = shiftDateKey(cursor, 1);
    count++;
    if (count > 366) return 366;
  }
  return count + 1;
}

// --- gmv-order-header-trend-map.ts ---
type TrendAggRow = {
  date: string;
  paidAmount: number;
  paidAmountWallet: number;
  paidAmountBonus: number;
  refundAmount: number;
  verifyAmount: number;
  orderCount: number;
};
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

// --- gmv-order-header-trend.ts ---
type OhTrendRow = {
  date: string;
  paidAmount: number;
  paidAmountWallet: number;
  paidAmountBonus: number;
  refundAmount: number;
  verifyAmount: number;
  orderCount: number;
};
export async function computeTrendFromOrderHeader(
  prisma: PrismaLike,
  startDate: string,
  endDate: string
): Promise<GmvTrendPoint[]> {
  const { start: dayStart } = beijingDayRangeUtc(startDate),
    { end: dayEnd } = beijingDayRangeUtc(endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT date(datetime("paidTime", '+8 hours')) AS "date", COALESCE(SUM("paidAmount"), 0) AS "paidAmount", COALESCE(SUM("paidAmountWallet"), 0) AS "paidAmountWallet", COALESCE(SUM("paidAmountBonus"), 0) AS "paidAmountBonus", COALESCE(SUM("refundAmount"), 0) AS "refundAmount", COALESCE(SUM("verifyAmount"), 0) AS "verifyAmount", COUNT(*) AS "orderCount" FROM "OrderHeader" WHERE "paidTime" >= ? AND "paidTime" < ? AND "paidTime" IS NOT NULL GROUP BY date(datetime("paidTime", '+8 hours')) ORDER BY "date" ASC`,
    dayStart.toISOString(),
    dayEnd.toISOString()
  )) as OhTrendRow[];
  return mapOrderHeaderTrendRows(rows, startDate, endDate);
}

// --- gmv-order-header-merchant-map.ts ---
// --- gmv-order-header-area-sql.ts ---

type DistSqlRow = {
  key: string;
  gmv: number;
  gmvOnline: number;
  gmvWallet: number;
  gmvBonus: number;
};

/**
 * OrderHeader.areaName 目前同步为空；优先走订单自身 area，
 * 否则回落到 ContentPackage.areaName（通过 packageId 关联）。
 */
export async function loadOrderHeaderAreaDistribution(
  prisma: PrismaLike,
  startIso: string,
  endIso: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv"
     FROM "OrderHeader"
     WHERE "paidTime" >= ? AND "paidTime" < ?`,
    startIso,
    endIso
  )) as Array<{ totalGmv: number }>;
  const totalGmv = Number(totalRow[0]?.totalGmv ?? 0);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(
              NULLIF(oh."areaName", ''),
              NULLIF(cp."areaName", ''),
              '未分区'
            ) AS "key",
            COALESCE(SUM(oh."paidAmount" + oh."paidAmountWallet"), 0) AS "gmv",
            COALESCE(SUM(oh."paidAmount"), 0) AS "gmvOnline",
            COALESCE(SUM(oh."paidAmountWallet"), 0) AS "gmvWallet",
            COALESCE(SUM(oh."paidAmountBonus"), 0) AS "gmvBonus"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE oh."paidTime" >= ? AND oh."paidTime" < ?
     GROUP BY COALESCE(NULLIF(oh."areaName", ''), NULLIF(cp."areaName", ''), '未分区')
     ORDER BY "gmv" DESC
     LIMIT ?`,
    startIso,
    endIso,
    limit
  )) as DistSqlRow[];

  // 若区域几乎全是「未分区」，改用商家榜作为区域热力的可解释维度
  const meaningful = rows.filter((r) => r.key && r.key !== '未分区');
  if (meaningful.length === 0) {
    const merchantRows = (await prisma.$queryRawUnsafe(
      `SELECT COALESCE(NULLIF(oh."merchantName", ''), '未知商家') AS "key",
              COALESCE(SUM(oh."paidAmount" + oh."paidAmountWallet"), 0) AS "gmv",
              COALESCE(SUM(oh."paidAmount"), 0) AS "gmvOnline",
              COALESCE(SUM(oh."paidAmountWallet"), 0) AS "gmvWallet",
              COALESCE(SUM(oh."paidAmountBonus"), 0) AS "gmvBonus"
       FROM "OrderHeader" oh
       WHERE oh."paidTime" >= ? AND oh."paidTime" < ?
       GROUP BY COALESCE(NULLIF(oh."merchantName", ''), '未知商家')
       ORDER BY "gmv" DESC
       LIMIT ?`,
      startIso,
      endIso,
      limit
    )) as DistSqlRow[];
    return { totalGmv, rows: merchantRows, dimLabel: 'merchant' as const };
  }

  return { totalGmv, rows, dimLabel: 'area' as const };
}

// --- gmv-order-header-category-sql.ts ---

/**
 * OrderHeader 本身没有 category，通过 packageId 关联 ContentPackage 聚合。
 * 无 packageId / 无匹配套餐的订单归入「未分类」。
 */
export async function loadOrderHeaderCategoryDistribution(
  prisma: PrismaLike,
  startIso: string,
  endIso: string,
  limit: number
) {
  const totalRow = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(${SQL_GMV_OH}), 0) AS "totalGmv"
     FROM "OrderHeader"
     WHERE "paidTime" >= ? AND "paidTime" < ?`,
    startIso,
    endIso
  )) as Array<{ totalGmv: number }>;
  const totalGmv = Number(totalRow[0]?.totalGmv ?? 0);

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COALESCE(NULLIF(cp."category", ''), '未分类') AS "key",
            COALESCE(SUM(${SQL_GMV_OH}), 0) AS "gmv",
            COALESCE(SUM(oh."paidAmount"), 0) AS "gmvOnline",
            COALESCE(SUM(oh."paidAmountWallet"), 0) AS "gmvWallet",
            COALESCE(SUM(oh."paidAmountBonus"), 0) AS "gmvBonus"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     WHERE oh."paidTime" >= ? AND oh."paidTime" < ?
     GROUP BY COALESCE(NULLIF(cp."category", ''), '未分类')
     ORDER BY "gmv" DESC
     LIMIT ?`,
    startIso,
    endIso,
    limit
  )) as DistSqlRow[];

  return { totalGmv, rows };
}

// --- gmv-order-header-breakdown.ts ---

function weekWindowIso() {
  const todayStr = beijingDateKey(new Date());
  const weekAgoStr = beijingDateKey(Date.now() - 6 * 86400000);
  return {
    startIso: beijingDayRangeUtc(weekAgoStr).start.toISOString(),
    endIso: beijingDayRangeUtc(todayStr).end.toISOString()
  };
}

export async function computeDistributionFromOrderHeader(
  prisma: PrismaLike,
  dim: string,
  limit: number
): Promise<GmvDistributionRow[]> {
  if (dim !== 'area' && dim !== 'category') return [];

  const { startIso, endIso } = weekWindowIso();
  const { totalGmv, rows } =
    dim === 'area'
      ? await loadOrderHeaderAreaDistribution(prisma, startIso, endIso, limit)
      : await loadOrderHeaderCategoryDistribution(prisma, startIso, endIso, limit);

  if (totalGmv <= 0) return [];
  return mapDistributionRows(rows, totalGmv);
}
