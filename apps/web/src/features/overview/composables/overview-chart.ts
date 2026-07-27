import type { OverviewTrendPoint } from '../../../services/api/overview.api';
import { buildCategoryBar, buildDualAxisLine } from '../../../utils/chart-options';
import { CHART_COLORS } from '../../../utils/chart-theme';
import { readFen } from '../../../utils/format';

const STALE_LABELS: Record<string, string> = {
  normal: '正常',
  stale_7d: '7d 未销',
  stale_15d: '15d 未销',
  stale_30d: '30d 未销',
  stale_60d: '60d+ 未销'
};
const STALE_COLORS: Record<string, string> = {
  normal: '#10b981',
  stale_7d: '#fde68a',
  stale_15d: '#fb923c',
  stale_30d: '#ef4444',
  stale_60d: '#7f1d1d'
};

function overviewDistributionLabel(key: string, dim: 'stale' | 'area' | 'category'): string {
  if (dim === 'stale') return STALE_LABELS[key] ?? key;
  return key;
}

function overviewDistributionColor(key: string, dim: 'stale' | 'area' | 'category'): string {
  if (dim !== 'stale') return '#2563eb';
  return STALE_COLORS[key] ?? '#94a3b8';
}

export function buildOverviewTrendOption(trend: OverviewTrendPoint[]) {
  if (trend.length === 0) return {};
  return buildDualAxisLine({
    categories: trend.map((p) => p.date.slice(5)),
    leftName: 'GMV',
    rightName: '成单数',
    series: [
      {
        name: 'GMV',
        data: trend.map((p) => Number(readFen(p, 'gmv') ?? 0) / 100),
        yAxisIndex: 0,
        color: CHART_COLORS.primary,
        area: true
      },
      {
        name: '成单数',
        data: trend.map((p) => p.paidOrderCount),
        yAxisIndex: 1,
        color: CHART_COLORS.secondary
      }
    ]
  });
}

export function buildOverviewDistributionOption(
  distribution: Array<{ key: string; totalSku: number; stockLeft: number }>,
  dim: 'stale' | 'area' | 'category'
) {
  if (distribution.length === 0) return {};
  return buildCategoryBar({
    items: distribution.map((r) => ({
      label: overviewDistributionLabel(r.key, dim),
      value: r.totalSku,
      color: overviewDistributionColor(r.key, dim),
      key: r.key,
      extra: { 剩余库存: r.stockLeft }
    })),
    yName: 'SKU 数',
    showShare: true,
    rotate: 30,
    barMaxWidth: 28
  });
}
