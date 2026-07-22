import type { ContentPackage } from './domain-types';
export const currentPrice = (pkg: ContentPackage): number =>
  pkg.temporarySalePrice ?? pkg.salePrice;
/**
 * Compact non-localized price string (no thousand separators).
 * UI surfaces that need locale grouping should use web `formatMoney` instead.
 */
export const formatPrice = (value?: number | null, decimals = 0): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  return Number(value.toFixed(decimals)).toString();
};
export const formatRatePercent = (value?: number | null, decimals = 1): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(decimals)}%`;
};
export const COPY_VERSION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
export const DEFAULT_SCENARIO = '日常运营推荐';
