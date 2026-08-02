import {
  CHART_CATEGORY_AXIS,
  CHART_COLORS,
  CHART_GRID,
  CHART_LEGEND,
  CHART_TOOLTIP,
  CHART_VALUE_AXIS
} from './chart-theme';
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
    legend: CHART_LEGEND,
    grid: CHART_GRID.dualAxis,
    xAxis: { type: 'category', data: params.categories, ...CHART_CATEGORY_AXIS },
    yAxis: {
      type: 'value',
      name: params.yName,
      scale: true,
      ...CHART_VALUE_AXIS,
      axisLabel: params.percent
        ? {
            ...CHART_VALUE_AXIS.axisLabel,
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`
          }
        : CHART_VALUE_AXIS.axisLabel
    },
    series: params.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series', scale: 1.2 },
      data: s.data,
      itemStyle: { color: s.color ?? palette[i % palette.length] },
      areaStyle: s.area ? { color: CHART_COLORS.areaFill } : undefined
    }))
  };
}
