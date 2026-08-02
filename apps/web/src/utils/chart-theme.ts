export const CHART_COLORS = {
  primary: '#0071e3',
  secondary: '#30b0c7',
  success: '#34c759',
  danger: '#ff3b30',
  warning: '#ff9f0a',
  purple: '#af52de',
  muted: '#8e8e93',
  areaFill: 'rgba(0, 113, 227, 0.1)',
  areaFillSecondary: 'rgba(48, 176, 199, 0.1)'
} as const;
export const CHART_GRID = {
  dualAxis: { left: 48, right: 48, top: 28, bottom: 24, containLabel: true },
  bar: { left: 40, right: 16, top: 18, bottom: 38, containLabel: true },
  compact: { left: 36, right: 14, top: 16, bottom: 22, containLabel: true }
} as const;
export const CHART_TOOLTIP = {
  axis: {
    trigger: 'axis' as const,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#dedee3',
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: '#1d1d1f', fontSize: 12 },
    extraCssText: 'border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.1);'
  },
  item: {
    trigger: 'item' as const,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#dedee3',
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: '#1d1d1f', fontSize: 12 },
    extraCssText: 'border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.1);'
  }
};
export const CHART_LEGEND = {
  top: 0,
  itemWidth: 10,
  itemHeight: 6,
  itemGap: 14,
  icon: 'roundRect',
  textStyle: { color: '#6e6e73', fontSize: 11 }
} as const;
export const CHART_CATEGORY_AXIS = {
  axisLine: { lineStyle: { color: '#d2d2d7' } },
  axisTick: { show: false },
  axisLabel: { color: '#6e6e73', fontSize: 11, hideOverlap: true }
} as const;
export const CHART_VALUE_AXIS = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: '#6e6e73', fontSize: 11 },
  splitLine: { lineStyle: { color: '#ededf0', type: 'dashed' } },
  nameTextStyle: { color: '#8e8e93', fontSize: 11 }
} as const;
export const STALE_BUCKET_CHART_COLORS: Record<string, string> = {
  normal: CHART_COLORS.success,
  stale_7d: '#ffd60a',
  stale_15d: CHART_COLORS.warning,
  stale_30d: CHART_COLORS.danger,
  stale_60d: '#8b1e28'
};
export const STALE_BUCKET_CHART_LABELS: Record<string, string> = {
  normal: '正常',
  stale_7d: '7d 未销',
  stale_15d: '15d 未销',
  stale_30d: '30d 未销',
  stale_60d: '60d+ 未销'
};

function cssToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

/** Runtime theme so every ChartPanel inherits the active light/dark Apple palette. */
export function createChartVisualTheme(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const ink = cssToken(styles, '--ink', '#1d1d1f');
  const muted = cssToken(styles, '--muted', '#6e6e73');
  const line = cssToken(styles, '--line', '#dedee3');
  const panel = cssToken(styles, '--panel', '#ffffff');
  const fontFamily = cssToken(
    styles,
    '--font-sans',
    '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  );

  return {
    color: [
      cssToken(styles, '--accent', CHART_COLORS.primary),
      CHART_COLORS.secondary,
      cssToken(styles, '--success', CHART_COLORS.success),
      cssToken(styles, '--warning', CHART_COLORS.warning),
      CHART_COLORS.purple,
      cssToken(styles, '--danger', CHART_COLORS.danger)
    ],
    backgroundColor: 'transparent',
    textStyle: { color: muted, fontFamily, fontSize: 11 },
    title: { textStyle: { color: ink, fontFamily, fontWeight: 700 } },
    legend: { textStyle: { color: muted, fontFamily, fontSize: 11 } },
    tooltip: {
      backgroundColor: panel,
      borderColor: line,
      borderWidth: 1,
      textStyle: { color: ink, fontFamily, fontSize: 12 }
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: { color: muted, fontFamily, fontSize: 11 },
      splitLine: { show: false }
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted, fontFamily, fontSize: 11 },
      splitLine: { lineStyle: { color: line, opacity: 0.58, type: 'dashed' } }
    }
  };
}
