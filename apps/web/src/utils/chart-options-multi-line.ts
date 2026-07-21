import { CHART_COLORS, CHART_GRID, CHART_TOOLTIP } from './chart-theme';
export function buildMultiLine(params: {
  categories: string[];
  series: Array<{ name: string; data: number[]; color?: string; area?: boolean }>;
  yName?: string;
  percent?: boolean;
}) {
  if (params.categories.length === 0) return {};
  const palette = [
    CHART_COLORS.primary,
    CHART_COLORS.secondary,
    CHART_COLORS.success,
    CHART_COLORS.danger
  ];
  return {
    tooltip: {
      ...CHART_TOOLTIP.axis,
      valueFormatter: params.percent ? (v: number) => `${(Number(v) * 100).toFixed(2)}%` : undefined
    },
    legend: { top: 0, textStyle: { fontSize: 11 } },
    grid: CHART_GRID.dualAxis,
    xAxis: { type: 'category', data: params.categories, axisLabel: { fontSize: 11 } },
    yAxis: {
      type: 'value',
      name: params.yName,
      axisLabel: params.percent
        ? { formatter: (v: number) => `${(v * 100).toFixed(0)}%` }
        : undefined
    },
    series: params.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      data: s.data,
      itemStyle: { color: s.color ?? palette[i % palette.length] },
      areaStyle: s.area ? { color: CHART_COLORS.areaFill } : undefined
    }))
  };
}
