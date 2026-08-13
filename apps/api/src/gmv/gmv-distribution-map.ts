/** GMV distribution projection with long-tail honesty metadata. */
import { netGmvParts, toFenBigInt } from '../common';
import type { GmvDistributionPayload, GmvDistributionRow } from './gmv.dto';

/**
 * Residual #289: project Top-N named buckets + optional synthetic 其他 long-tail,
 * plus honesty fields so SPA can banner when head is incomplete.
 *
 * Callers query LIMIT+1. This matters for signed net GMV: a negative or zero
 * tail cannot be detected by testing whether head GMV is below the platform
 * total. Share denominators stay platform totalGmv (not re-based on head).
 */
export function mapDistributionRows(
  rows: Array<{
    key: string;
    gmvFen?: bigint | number | null;
    gmvOnlineFen?: bigint | number | null;
    gmvWalletFen?: bigint | number | null;
    gmvBonusFen?: bigint | number | null;
    refundFen?: bigint | number | null;
    gmv?: number;
    gmvOnline?: number;
    gmvWallet?: number;
    gmvBonus?: number;
  }>,
  totalGmvFen: bigint | number,
  limit?: number
): GmvDistributionPayload {
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : rows.length;
  const safeTotalGmvFen = toFenBigInt(totalGmvFen);
  const namedRows = rows.slice(0, safeLimit);
  const getGmvFen = (r: (typeof rows)[number]) => toFenBigInt(r.gmvFen ?? r.gmv);
  const topGmv = namedRows.reduce((s, r) => s + getGmvFen(r), 0n);
  const items: (GmvDistributionRow & { totalGmv?: number })[] = namedRows.map((r) => {
    const gmvVal = r.gmvFen ?? r.gmv ?? 0;
    const onlineVal = r.gmvOnlineFen ?? r.gmvOnline ?? 0;
    const walletVal = r.gmvWalletFen ?? r.gmvWallet ?? 0;
    const bonusVal = r.gmvBonusFen ?? r.gmvBonus ?? 0;
    const refundVal = r.refundFen ?? 0;
    const netParts =
      r.refundFen == null
        ? { onlineFen: toFenBigInt(onlineVal), walletFen: toFenBigInt(walletVal) }
        : netGmvParts(toFenBigInt(onlineVal), toFenBigInt(walletVal), toFenBigInt(refundVal));
    const gmvFen = toFenBigInt(gmvVal);
    const bonusFen = toFenBigInt(bonusVal);
    return {
      key: r.key,
      totalGmv: Number(gmvFen),
      totalGmvFen: gmvFen,
      gmvOnlineFen: netParts.onlineFen,
      gmvWalletFen: netParts.walletFen,
      gmvBonusFen: bonusFen,
      share: safeTotalGmvFen !== 0n ? Number(gmvFen) / Number(safeTotalGmvFen) : 0
    };
  });
  // Prefer the LIMIT+1 probe. Keep the remainder check for compatibility with
  // direct callers that still pass only the head rows.
  const truncated = rows.length > safeLimit || topGmv !== safeTotalGmvFen;
  if (truncated) {
    const otherGmv = safeTotalGmvFen - topGmv;
    items.push({
      key: '其他',
      totalGmv: Number(otherGmv),
      totalGmvFen: otherGmv,
      // The LIMIT+1 probe proves a tail but does not materialize every tail
      // bucket, so its payment-channel split is intentionally unknown.
      gmvOnlineFen: null,
      gmvWalletFen: null,
      gmvBonusFen: null,
      share: safeTotalGmvFen !== 0n ? Number(otherGmv) / Number(safeTotalGmvFen) : 0
    });
  }
  return {
    items,
    limit: safeLimit,
    // LIMIT+1 only proves "at least one more"; it intentionally avoids COUNT(*).
    matched: truncated ? Math.max(safeLimit + 1, rows.length) : namedRows.length,
    truncated
  };
}
