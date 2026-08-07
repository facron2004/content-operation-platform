import { toSqliteDateTimeOrNull } from '../common/sqlite-datetime';

/** Order-like row shape used across GMV queries and upserts. */
export type OrderLike = {
  orderId?: string | null;
  /** JeSite 展示单号（K…），可与雪花 id 并存 */
  orderCode?: string | null;
  memberId?: string | null;
  packageId?: string | null;
  merchantId?: string | null;
  merchantName?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  /** 业务员姓名；空串写入时归一为 null */
  salesman?: string | null;
  /** 上级业务员姓名 */
  parentSalesman?: string | null;
  /** 优惠券文案 */
  coupon?: string | null;
  orderTime: string | Date;
  paidTime?: string | Date | null;
  verifyTime?: string | Date | null;
  refundTime?: string | Date | null;
  orderAmount: number;
  paidAmount: number;
  paidAmountWallet: number;
  paidAmountBonus: number;
  paidAmountCard: number;
  refundAmount?: number | null;
  verifyAmount?: number | null;
  pointEarned?: number | null;
  pointUsed?: number | null;
  status: string;
};

export type OrderHeaderGmvRow = {
  paidAmountFen: bigint;
  paidAmountWalletFen: bigint;
  paidAmountBonusFen: bigint;
  paidAmountCardFen: bigint;
  verifyAmountFen: bigint;
  refundAmountFen?: bigint;
  orderCount: number;
  refundOrderCount: number;
  verifyCount: number;
};

export const EMPTY_ORDER_HEADER_GMV_ROW: OrderHeaderGmvRow = {
  paidAmountFen: 0n,
  paidAmountWalletFen: 0n,
  paidAmountBonusFen: 0n,
  paidAmountCardFen: 0n,
  verifyAmountFen: 0n,
  refundAmountFen: 0n,
  orderCount: 0,
  refundOrderCount: 0,
  verifyCount: 0
};

// Residual #121: removed dead toIsoText alias — writers use toSqliteDateTimeOrNull.

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function toOrderHeaderSharedFields(o: OrderLike) {
  return {
    orderCode: emptyToNull(o.orderCode),
    memberId: o.memberId || null,
    packageId: o.packageId || null,
    merchantId: o.merchantId || null,
    merchantName: o.merchantName || null,
    areaId: o.areaId || null,
    areaName: o.areaName || null,
    salesman: emptyToNull(o.salesman),
    parentSalesman: emptyToNull(o.parentSalesman),
    coupon: emptyToNull(o.coupon),
    // orderTime is required on OrderLike; invalid input falls back to now so
    // upsert never writes a null NOT NULL column.
    orderTime: toSqliteDateTimeOrNull(o.orderTime) ?? toSqliteDateTimeOrNull(new Date())!,
    paidTime: toSqliteDateTimeOrNull(o.paidTime ?? null),
    verifyTime: toSqliteDateTimeOrNull(o.verifyTime ?? null),
    refundTime: toSqliteDateTimeOrNull(o.refundTime ?? null),
    orderAmount: o.orderAmount,
    paidAmount: o.paidAmount,
    paidAmountWallet: o.paidAmountWallet,
    paidAmountBonus: o.paidAmountBonus,
    paidAmountCard: o.paidAmountCard,
    refundAmount: o.refundAmount ?? 0,
    verifyAmount: o.verifyAmount ?? 0,
    status: o.status
  };
}

export function toOrderHeaderCreate(o: OrderLike) {
  return {
    orderId: o.orderId!,
    ...toOrderHeaderSharedFields(o),
    pointEarned: o.pointEarned ?? 0,
    pointUsed: o.pointUsed ?? 0,
    channel: 'jeesite'
  };
}

export function toOrderHeaderUpdate(o: OrderLike) {
  return toOrderHeaderSharedFields(o);
}
