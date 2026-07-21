export const CHART_COLORS = {
  primary: '#2563eb',
  secondary: '#f97316',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#fb923c',
  muted: '#94a3b8',
  areaFill: 'rgba(37, 99, 235, 0.08)',
  areaFillSecondary: 'rgba(249, 115, 22, 0.08)'
} as const;
export const CHART_GRID = {
  dualAxis: { left: 56, right: 56, top: 28, bottom: 28 },
  bar: { left: 48, right: 24, top: 20, bottom: 52 },
  compact: { left: 44, right: 20, top: 18, bottom: 28 }
} as const;
export const CHART_TOOLTIP = {
  axis: { trigger: 'axis' as const },
  item: { trigger: 'item' as const }
};
export const STALE_BUCKET_CHART_COLORS: Record<string, string> = {
  normal: '#10b981',
  stale_7d: '#fde68a',
  stale_15d: '#fb923c',
  stale_30d: '#ef4444',
  stale_60d: '#7f1d1d'
};
export const STALE_BUCKET_CHART_LABELS: Record<string, string> = {
  normal: '正常',
  stale_7d: '7d 未销',
  stale_15d: '15d 未销',
  stale_30d: '30d 未销',
  stale_60d: '60d+ 未销'
};
