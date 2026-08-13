import type {
  GmvDistributionRow,
  GmvHourlyPoint,
  GmvTrendPoint
} from '../../../services/api/gmv.api';
import { buildCategoryBar, buildDualAxisLine, buildMultiLine } from '../../../utils/chart-options';
import { CHART_COLORS, CHART_GRID, CHART_TOOLTIP } from '../../../utils/chart-theme';
import { displayMoney, formatPercentRaw, readFen } from '../../../utils/format';

export function buildGmvDistributionOption(distribution: GmvDistributionRow[]) {
  if (distribution.length === 0) return {};
  return buildCategoryBar({
    items: distribution.map((r) => ({
      label: r.key,
      value: Number(readFen(r, 'totalGmv') ?? 0) / 100,
      color: CHART_COLORS.primary,
      key: r.key,
      extra: {
        占比: formatPercentRaw(r.share * 100),
        在线: displayMoney(r, 'gmvOnline'),
        余额: displayMoney(r, 'gmvWallet')
      }
    })),
    yName: '净 GMV',
    showShare: true,
    rotate: 30,
    barMaxWidth: 32
  });
}

export type GmvTrendMode = 'volume' | 'rates' | 'mix';
export type GmvTrendGranularity = 'day' | 'week' | 'month';

export function buildGmvTrendOption(
  trend: GmvTrendPoint[],
  mode: GmvTrendMode = 'volume',
  granularity: GmvTrendGranularity = 'day'
) {
  if (trend.length === 0) return {};
  const categories = trend.map((p) => formatTrendLabel(p.date, granularity));

  if (mode === 'rates') {
    return buildMultiLine({
      categories,
      yName: '比率',
      percent: true,
      series: [
        {
          name: '退款率',
          data: trend.map((p) => Number(p.refundRate.toFixed(4))),
          color: CHART_COLORS.danger
        },
        {
          name: '核销率',
          data: trend.map((p) => Number(p.verifyRate.toFixed(4))),
          color: CHART_COLORS.success
        }
      ]
    });
  }

  if (mode === 'mix') {
    return buildMultiLine({
      categories,
      yName: '净 GMV',
      series: [
        {
          name: '在线现金',
          data: trend.map((p) => Number(readFen(p, 'gmvOnline') ?? 0) / 100),
          color: CHART_COLORS.primary,
          area: true
        },
        {
          name: '余额支付',
          data: trend.map((p) => Number(readFen(p, 'gmvWallet') ?? 0) / 100),
          color: CHART_COLORS.secondary
        }
      ]
    });
  }

  // Default: clean single net-GMV area line.
  return {
    color: [CHART_COLORS.primary],
    tooltip: {
      ...CHART_TOOLTIP.axis,
      valueFormatter: (v: number) =>
        `¥ ${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
    },
    grid: { left: 52, right: 18, top: 24, bottom: 32 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: categories,
      axisLine: { lineStyle: { color: '#e4e7ec' } },
      axisTick: { show: false },
      axisLabel: { color: '#98a2b3', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      name: '',
      splitLine: { lineStyle: { color: '#f2f4f7', type: 'dashed' } },
      axisLabel: {
        color: '#98a2b3',
        fontSize: 11,
        formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${v}`)
      }
    },
    series: [
      {
        name: '净 GMV（元）',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 3, color: '#2e90fa' },
        itemStyle: { color: '#2e90fa' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(46, 144, 250, 0.28)' },
              { offset: 1, color: 'rgba(46, 144, 250, 0.02)' }
            ]
          }
        },
        data: trend.map((p) => Number(readFen(p, 'totalGmv') ?? 0) / 100)
      }
    ]
  };
}

export function buildGmvHourlyOption(hourly: GmvHourlyPoint[]) {
  if (!hourly.length) return {};
  return {
    color: ['#2e90fa'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) =>
        `¥ ${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
    },
    grid: { left: 48, right: 14, top: 20, bottom: 32 },
    xAxis: {
      type: 'category',
      data: hourly.map((p) => p.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e4e7ec' } },
      axisLabel: { color: '#98a2b3', fontSize: 11, interval: 1 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f2f4f7', type: 'dashed' } },
      axisLabel: {
        color: '#98a2b3',
        fontSize: 11,
        formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${v}`)
      }
    },
    series: [
      {
        name: '净 GMV（元）',
        type: 'bar',
        data: hourly.map((p) => Number(readFen(p, 'totalGmv') ?? 0) / 100),
        itemStyle: {
          color: '#2e90fa',
          borderRadius: [4, 4, 0, 0]
        },
        barMaxWidth: 16
      }
    ]
  };
}

function formatTrendLabel(date: string, granularity: GmvTrendGranularity): string {
  if (granularity === 'month') return date;
  if (granularity === 'week') return date;
  return date.length >= 10 ? date.slice(5) : date;
}

// keep dual-axis helper import used for non-default modes
void buildDualAxisLine;
void CHART_GRID;
