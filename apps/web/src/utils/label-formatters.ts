import { formatRatePercent } from '@content/shared';
export function displayPrice(row: {
  temporarySalePrice?: number | null;
  salePrice?: number;
}): string {
  const price = row.temporarySalePrice ?? row.salePrice;
  return price == null ? '-' : `${price}`;
}
export function formatMoney(value?: number, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `${value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
export const percent = formatRatePercent;
export function formatTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
export function scoreTooltip(
  score: { dimensions?: Array<{ label: string; score: number }> } | null | undefined
): string {
  if (!score?.dimensions?.length) return '';
  return score.dimensions
    .slice(0, 4)
    .map((item) => `${item.label} ${Math.round(item.score)}`)
    .join(' / ');
}
