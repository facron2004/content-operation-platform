const finite = (value?: number | null) => value != null && Number.isFinite(value);
export function formatNumber(value?: number | null, decimals = 2): string {
  return finite(value)
    ? value!.toLocaleString('zh-CN', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
    : '—';
}
export function formatGmv(value?: number | null, withSymbol = true): string {
  if (!finite(value)) return '—';
  const n = formatNumber(value);
  return withSymbol ? `¥ ${n}` : n;
}
export function formatPercent(value?: number | null, decimals = 2): string {
  return finite(value) ? `${(value! * 100).toFixed(decimals)}%` : '—';
}
export function formatPercentRaw(value?: number | null, decimals = 2): string {
  return finite(value) ? `${value!.toFixed(decimals)}%` : '—';
}
export function formatCount(value?: number | null): string {
  return finite(value) ? value!.toLocaleString('zh-CN') : '—';
}
export function rateClass(rate: number, warn: number, danger: number): string {
  return rate >= danger ? 'rate-danger' : rate >= warn ? 'rate-warning' : 'rate-ok';
}
export function rateClassInv(rate: number, warn: number, danger: number): string {
  return rate > 0 && rate < danger
    ? 'rate-danger'
    : rate > 0 && rate < warn
      ? 'rate-warning'
      : 'rate-ok';
}

// VNext 金额精度治理（PRD §7.4.4/§7.4.5）：前端消费后端 *Fen/*Display，禁止浮点金额运算。
export { displayMoney, formatFenYuan, sumMoney, sumMoneyFen, readFen } from './money';
