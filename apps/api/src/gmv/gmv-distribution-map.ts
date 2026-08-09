/** GMV distribution projection with long-tail honesty metadata. */
import { netGmvParts, toFenBigInt } from '../common';
import type { GmvDistributionPayload, GmvDistributionRow } from './gmv.dto';

/**
 * Residual #289: project Top-N named buckets + optional synthetic 其他 long-tail,
 * plus honesty fields so SPA can banner when head is incomplete.
 *
 * limit is the requested named-bucket head (SQL LIMIT). matched is at-least
 * limit + 1 when truncated (long-tail remainder exists) — no extra COUNT(*) of
 * distinct keys. Share denominators stay platform totalGmv (not re-based on head).
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
  const getGmvFen = (r: (typeof rows)[number]) => toFenBigInt(r.gmvFen ?? r.gmv);
  const topGmv = rows.reduce((s, r) => s + getGmvFen(r), 0n);
  const items: (GmvDistributionRow & { totalGmv?: number })[] = rows.map((r) => {
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
      share: safeTotalGmvFen > 0n ? Number(gmvFen) / Number(safeTotalGmvFen) : 0
    };
  });
  // Residual #289: long-tail remainder means head was capped.
  const truncated = safeTotalGmvFen > 0n && topGmv < safeTotalGmvFen;
  if (truncated) {
    const otherGmv = safeTotalGmvFen - topGmv;
    items.push({
      key: '其他',
      totalGmv: Number(otherGmv),
      totalGmvFen: otherGmv,
      gmvOnlineFen: otherGmv,
      gmvWalletFen: 0n,
      gmvBonusFen: 0n,
      share: Number(otherGmv) / Number(safeTotalGmvFen)
    });
  }
  return {
    items,
    limit: safeLimit,
    // When truncated we know at least one extra named bucket exists beyond the head.
    matched: truncated ? Math.max(safeLimit + 1, rows.length + 1) : rows.length,
    truncated
  };
}
