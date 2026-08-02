import { CHART_CATEGORY_AXIS, CHART_COLORS, CHART_GRID, CHART_VALUE_AXIS } from './chart-theme';
export type CategoryBarItem = {
  label: string;
  value: number;
  color?: string;
  key?: string;
  extra?: Record<string, unknown>;
};
export function buildCategoryBar(params: {
  items: CategoryBarItem[];
  yName?: string;
  rotate?: number;
  barMaxWidth?: number;
  showShare?: boolean;
}) {
  if (params.items.length === 0) return {};
  const total = params.items.reduce((s, i) => s + i.value, 0);
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: { name: string; value: number; dataIndex: number }) => {
        const item = params.items[p.dataIndex],
          share = total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0';
        const extras = item?.extra
          ? Object.entries(item.extra)
              .map(([k, v]) => `${k}: ${v}`)
              .join('<br/>')
          : '';
        return `${p.name}<br/>${params.yName ?? '值'}: ${p.value}${params.showShare ? `（${share}%）` : ''}${extras ? `<br/>${extras}` : ''}`;
      }
    },
    grid: CHART_GRID.bar,
    xAxis: {
      type: 'category',
      data: params.items.map((i) => i.label),
      ...CHART_CATEGORY_AXIS,
      axisLabel: {
        ...CHART_CATEGORY_AXIS.axisLabel,
        rotate: params.rotate ?? 0,
        interval: 0
      }
    },
    yAxis: { type: 'value', name: params.yName, ...CHART_VALUE_AXIS },
    series: [
      {
        type: 'bar',
        barMaxWidth: params.barMaxWidth ?? 22,
        emphasis: { focus: 'series' },
        data: params.items.map((i) => ({
          value: i.value,
          key: i.key ?? i.label,
          itemStyle: {
            color: i.color ?? CHART_COLORS.primary,
            borderRadius: [6, 6, 2, 2]
          }
        }))
      }
    ]
  };
}
