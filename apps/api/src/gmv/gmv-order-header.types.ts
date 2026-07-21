/** Order-like row shape used across GMV queries and upserts. */
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

/** Normalize any Date/string/number into UTC ISO text. Prisma+sqlite DateTime
 *  writes as integer epoch ms, which breaks our ISO-string day-range SQL.
 *  Always store ISO text via raw SQL. */
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
