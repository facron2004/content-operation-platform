/** GMV merchant sorting and bounded page projection. */
import { clampListPage, clampListPageSize } from '../common';
import { GMV_TOP_MERCHANTS_LIMIT } from '../common/sql-chunk';
import type { GmvMerchantRow, GmvMerchantSort } from './gmv.dto';

/** Sort merchants by the requested metric (no page). */
export function sortMerchants(
  merchants: GmvMerchantRow[],
  sortBy: GmvMerchantSort
): GmvMerchantRow[] {
  const sorted = [...merchants];
  sorted.sort((a, b) => {
    const aRefund = Number(a.gmvRefundFen ?? (a as any).gmvRefund ?? 0);
    const bRefund = Number(b.gmvRefundFen ?? (b as any).gmvRefund ?? 0);
    if (sortBy === 'refundDesc')
      return bRefund - aRefund || a.merchantName.localeCompare(b.merchantName);
    if (sortBy === 'verifyDesc')
      return (
        Number(b.gmvVerifyFen ?? (b as any).gmvVerify ?? 0) -
          Number(a.gmvVerifyFen ?? (a as any).gmvVerify ?? 0) ||
        a.merchantName.localeCompare(b.merchantName)
      );
    // The fen path is already net GMV from SQL_GMV_SS; only the legacy float
    // fallback still carries gross GMV and needs the refund subtraction.
    const aGmv =
      a.gmvFen != null
        ? Number(a.gmvFen)
        : Number((a as unknown as { gmv?: number }).gmv ?? 0) - aRefund;
    const bGmv =
      b.gmvFen != null
        ? Number(b.gmvFen)
        : Number((b as unknown as { gmv?: number }).gmv ?? 0) - bRefund;
    return bGmv - aGmv || a.merchantName.localeCompare(b.merchantName);
  });
  return sorted;
}

export type GmvMerchantPage = {
  items: GmvMerchantRow[];
  hasMore: boolean;
  /** Residual #265: GMV_TOP_MERCHANTS_LIMIT honesty (parity merchant-sales #264). */
  limit: number;
  truncated: boolean;
};

export function pageMerchants(
  sorted: GmvMerchantRow[],
  page: number,
  pageSize: number
): GmvMerchantPage {
  // Defense-in-depth: DTO Max already bounds interactive callers; still clamp here
  // so internal/miswired call sites cannot OFFSET into huge cached rankings.
  const safePage = clampListPage(page);
  const safePageSize = clampListPageSize(pageSize, 100, 20);
  const offset = (safePage - 1) * safePageSize,
    paged = sorted.slice(offset, offset + safePageSize);
  const limit = GMV_TOP_MERCHANTS_LIMIT;
  // Head-full means SQL LIMIT may have clipped the true merchant set.
  const truncated = sorted.length >= limit;
  return {
    items: paged,
    hasMore: paged.length === safePageSize && sorted.length > offset + safePageSize,
    limit,
    truncated
  };
}

export function sortAndPageMerchants(
  merchants: GmvMerchantRow[],
  sortBy: GmvMerchantSort,
  page: number,
  pageSize: number
): GmvMerchantPage {
  return pageMerchants(sortMerchants(merchants, sortBy), page, pageSize);
}
