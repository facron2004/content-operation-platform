import { sqlDatetimeExclusiveRange } from '../common';

export type PrismaLike = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

export const PAID_WHERE = sqlDatetimeExclusiveRange('"paidTime"');

/** 统一单数口径: 核销 = verifyTime IS NOT NULL (与 gmv/refund/merchant-sales/DailyMetrics 一致). */
export const IS_VERIFIED = `("verifyTime" IS NOT NULL)`;

/** Best-effort: cancelled without refund treated as expired-like. */
export const IS_EXPIRED = `("status" = 'cancelled' AND COALESCE("refundAmountFen", 0) = 0 AND "verifyTime" IS NULL)`;

export const SALESMAN_NAME = `COALESCE(NULLIF(TRIM("salesman"), ''), '（未命名业务员）')`;
export const MERCHANT_NAME = `COALESCE(NULLIF(TRIM("merchantName"), ''), '（未命名商家）')`;

/**
 * Refund money is the refunded paid components: paid amount + balance.
 * refundAmountFen is a raw source total that can disagree with these
 * components, while the refund count still uses refundAmountFen > 0 so the
 * order count is preserved.
 */
export const REFUND_COMPONENTS_FEN = (alias = '') =>
  `COALESCE(${alias}"paidAmountFen", 0) + COALESCE(${alias}"paidAmountWalletFen", 0)`;

export function n(v: number | null | undefined): number {
  return Number(v ?? 0);
}

/** Convert fen (bigint from *Fen columns) to a yuan number. */
export function fenToYuan(v: bigint | number | null | undefined): number {
  return Number(v ?? 0) / 100;
}

export function rate(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}
