import { safeRatio } from '@content/shared';
/** OrderHeader Net GMV: online cash + wallet minus refund (bonus never included). */ export const SQL_GMV_OH = `(COALESCE("paidAmountFen", 0) + COALESCE("paidAmountWalletFen", 0) - COALESCE("refundAmountFen", 0))`;
/** SalesSnapshot / MerchantDailyMetrics Net GMV: online + wallet minus refund (bonus never included). */ export const SQL_GMV_SS = `(COALESCE("paidAmountOnlineFen", 0) + COALESCE("paidAmountWalletFen", 0) - COALESCE("refundAmountFen", 0))`;
/** Bigint addition of two fen parts (online + wallet). */ export const gmvFromParts = (
  online: bigint,
  wallet: bigint
): bigint => online + wallet;

/** Preserve bigint fen values; only legacy numeric values need normalization. */
export const toFenBigInt = (value: bigint | number | null | undefined, scale = 1): bigint => {
  if (typeof value === 'bigint') return value;
  return BigInt(Math.round((value ?? 0) * scale));
};

/**
 * Allocate total refunds across the two GMV payment parts proportionally.
 * OrderHeader only stores the combined refund amount, so this keeps the
 * channel mix while guaranteeing online + wallet === net GMV in fen.
 */
export const netGmvParts = (
  onlineFen: bigint,
  walletFen: bigint,
  refundFen: bigint
): { onlineFen: bigint; walletFen: bigint } => {
  const grossFen = gmvFromParts(onlineFen, walletFen);
  const netFen = grossFen - refundFen;
  if (grossFen === 0n) return { onlineFen: netFen, walletFen: 0n };

  const netOnlineFen = (onlineFen * netFen) / grossFen;
  return { onlineFen: netOnlineFen, walletFen: netFen - netOnlineFen };
};
export const rateAgainstGmv = (amount: number, gmv: number): number => safeRatio(amount, gmv);

/**
 * Net GMV (gross − refund) must never be negative in a KPI: a period or merchant
 * cannot "un-earn" more than it actually sold. Floor at 0 so the GMV card stays
 * sane when refunds exceed recognized GMV — e.g. orders paid fully by
 * coupon/bonus carry paidAmountFen=0 yet still get refunded, or refunds land on a
 * low-sales day. The separate refund / refundRate fields still expose the full
 * refund magnitude, so nothing is hidden, only the KPI floor is applied.
 */
export const floorNonNegativeFen = (fen: bigint): bigint => (fen < 0n ? 0n : fen);

/**
 * Canonical 单数口径 for 退款率/核销率 across the whole app:
 *   refundRate  = refundCount  / paidOrderCount
 *   verifyRate  = verifyCount  / paidOrderCount
 * Order count (单数) — never amount — is the denominator, per the unified caliber.
 * safeRatio guards the zero-paidOrderCount case (returns 0).
 */
export const rateByCount = (numerator: number, denominator: number): number =>
  safeRatio(numerator, denominator);
