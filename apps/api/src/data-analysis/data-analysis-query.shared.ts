import { safeRatio } from '@content/shared';
import { sqlDatetimeExclusiveRange } from '../common';

export type PrismaLike = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

export const PAID_WHERE = sqlDatetimeExclusiveRange('"paidTime"');

/** 统一单数口径: 核销 = verifyTime IS NOT NULL (与 gmv/refund/merchant-sales/DailyMetrics 一致). */
export const IS_VERIFIED = `("verifyTime" IS NOT NULL)`;

/** Best-effort: cancelled without refund treated as expired-like. */
export const IS_EXPIRED = `("status" = 'cancelled' AND COALESCE("refundAmountFen", 0) = 0 AND "verifyTime" IS NULL)`;

/** 待核销与已核销、已退款、已过期互斥。 */
export const IS_PENDING_VERIFY = `("verifyTime" IS NULL AND COALESCE("refundAmountFen", 0) = 0 AND COALESCE("status", '') NOT IN ('cancelled', 'refunded'))`;

export const SALESMAN_NAME = `COALESCE(NULLIF(TRIM("salesman"), ''), '（未命名业务员）')`;
export const MERCHANT_NAME = `COALESCE(NULLIF(TRIM("merchantName"), ''), '（未命名商家）')`;

/** 实际退款金额；所有数据分析金额与退款接口共用 refundAmountFen 口径。 */
export const REFUND_AMOUNT_FEN = (alias = '') => `COALESCE(${alias}"refundAmountFen", 0)`;

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

/** Canonical count-based API ratio, matching GMV/refund four-decimal precision. */
export function rateByCount(num: number, den: number): number {
  return safeRatio(num, den);
}
