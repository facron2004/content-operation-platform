import { safeRatio } from '@content/shared';
/** OrderHeader Net GMV: online cash + wallet minus refund (bonus never included). */ export const SQL_GMV_OH = `(COALESCE("paidAmountFen", 0) + COALESCE("paidAmountWalletFen", 0) - COALESCE("refundAmountFen", 0))`;
/** SalesSnapshot / MerchantDailyMetrics Net GMV: online + wallet minus refund (bonus never included). */ export const SQL_GMV_SS = `(COALESCE("paidAmountOnlineFen", 0) + COALESCE("paidAmountWalletFen", 0) - COALESCE("refundAmountFen", 0))`;
/** Bigint addition of two fen parts (online + wallet). */ export const gmvFromParts = (
  online: bigint,
  wallet: bigint
): bigint => online + wallet;
export const rateAgainstGmv = (amount: number, gmv: number): number => safeRatio(amount, gmv);
