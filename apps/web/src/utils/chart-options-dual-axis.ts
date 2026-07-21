import { CHART_COLORS, CHART_GRID, CHART_TOOLTIP } from './chart-theme';
export type DualAxisLineSeries = {
  name: string;
  data: number[];
  yAxisIndex?: 0 | 1;
  color?: string;
  area?: boolean;
};
export function buildDualAxisLine(params: {
  categories: string[];
  series: DualAxisLineSeries[];
  leftName?: string;
  rightName?: string;
  percentRight?: boolean;
}) {
  if (params.categories.length === 0) return {};
  return {
    tooltip: CHART_TOOLTIP.axis,
    legend: { top: 0, textStyle: { fontSize: 11 } },
    grid: CHART_GRID.dualAxis,
    xAxis: { type: 'category', data: params.categories, axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: 'value', name: params.leftName, position: 'left' },
      {
        type: 'value',
        name: params.rightName,
        position: 'right',
        axisLabel: params.percentRight
          ? { formatter: (v: number) => `${(v * 100).toFixed(0)}%` }
          : undefined
      }
    ],
    series: params.series.map((s, i) => {
      const color = s.color ?? (i === 0 ? CHART_COLORS.primary : CHART_COLORS.secondary);
      return {
        name: s.name,
        type: 'line',
        smooth: true,
        yAxisIndex: s.yAxisIndex ?? (i === 0 ? 0 : 1),
        data: s.data,
        itemStyle: { color },
        areaStyle: s.area
          ? { color: i === 0 ? CHART_COLORS.areaFill : CHART_COLORS.areaFillSecondary }
          : undefined
      };
    })
  };
}
