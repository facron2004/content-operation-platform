import { formatRatePercent } from '@content/shared';
import { displayMoney, formatFenYuan, sumMoney, sumMoneyFen, readFen } from './money';

// VNext 金额精度治理（PRD §7.4.4/§7.4.5）：消费后端 *Fen/*Display。
export { displayMoney, formatFenYuan, sumMoney, sumMoneyFen, readFen };

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

// VNext §7.4.5：优先读临时售价 → 售价的 *Fen/*Display，统一格式化为 ¥ x.xx。
export function displayPrice(row: {
  temporarySalePrice?: number | null;
  salePrice?: number | null;
}): string {
  if (row.temporarySalePrice == null && row.salePrice == null) return '-';
  const field = row.temporarySalePrice != null ? 'temporarySalePrice' : 'salePrice';
  return displayMoney(row, field);
}
