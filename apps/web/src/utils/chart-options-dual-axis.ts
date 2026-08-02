import {
  CHART_CATEGORY_AXIS,
  CHART_COLORS,
  CHART_GRID,
  CHART_LEGEND,
  CHART_TOOLTIP,
  CHART_VALUE_AXIS
} from './chart-theme';
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
    legend: CHART_LEGEND,
    grid: CHART_GRID.dualAxis,
    xAxis: { type: 'category', data: params.categories, ...CHART_CATEGORY_AXIS },
    yAxis: [
      {
        type: 'value',
        name: params.leftName,
        position: 'left',
        scale: true,
        ...CHART_VALUE_AXIS
      },
      {
        type: 'value',
        name: params.rightName,
        position: 'right',
        scale: true,
        ...CHART_VALUE_AXIS,
        axisLabel: params.percentRight
          ? {
              ...CHART_VALUE_AXIS.axisLabel,
              formatter: (v: number) => `${(v * 100).toFixed(0)}%`
            }
          : CHART_VALUE_AXIS.axisLabel
      }
    ],
    series: params.series.map((s, i) => {
      const color = s.color ?? (i === 0 ? CHART_COLORS.primary : CHART_COLORS.secondary);
      return {
        name: s.name,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 },
        emphasis: { focus: 'series', scale: 1.2 },
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
