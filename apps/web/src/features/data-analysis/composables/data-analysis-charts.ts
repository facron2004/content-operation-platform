import type {
  DataAnalysisChannelSlice,
  DataAnalysisDailyPoint,
  DataAnalysisHourlyRow,
  DataAnalysisTimeSlotRow
} from '../../../services/api/data-analysis.api';
import { readFen } from '../../../utils/format';

/** Dual-line daily sales trend: net sales + net GMV. */
export function buildDailyTrendOption(points: DataAnalysisDailyPoint[]) {
  if (!points.length) return {};
  const dates = points.map((p) => p.date.slice(5)); // MM-DD
  const net = points.map((p) => Number(readFen(p, 'writeOffAmount') ?? 0) / 100);
  const netGmv = points.map((p) => Number(readFen(p, 'netGmv') ?? 0) / 100);
  return {
    color: ['#2563eb', '#10b981'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: '#98a2b3' } }
    },
    legend: {
      top: 0,
      right: 8,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: '#667085', fontSize: 12 }
    },
    grid: { left: 48, right: 16, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: '#e4e8ef' } },
      axisTick: { show: false },
      axisLabel: { color: '#98a2b3', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f1f4f8', type: 'dashed' } },
      axisLabel: {
        color: '#98a2b3',
        fontSize: 11,
        formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))
      }
    },
    series: [
      {
        name: '核销额',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: net,
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(37, 99, 235, 0.12)' },
              { offset: 1, color: 'rgba(37, 99, 235, 0)' }
            ]
          }
        }
      },
      {
        name: '净 GMV',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: netGmv,
        lineStyle: { width: 2 }
      }
    ]
  };
}

/** Channel sales donut with center total. */
export function buildChannelDonutOption(channels: DataAnalysisChannelSlice[], totalSales: number) {
  if (!channels.length) return {};
  // Fixed categorical order matching prototype palette.
  const palette = ['#2563eb', '#14b8a6', '#f59e0b', '#ec4899', '#94a3b8'];
  return {
    color: palette,
    tooltip: {
      trigger: 'item',
      formatter: (p: { name?: string; value?: number; percent?: number }) =>
        `${p.name ?? ''}<br/>¥ ${Number(p.value ?? 0).toLocaleString('zh-CN', {
          maximumFractionDigits: 2
        })} · ${(p.percent ?? 0).toFixed(1)}%`
    },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: { show: false },
        labelLine: { show: false },
        data: channels.map((c) => ({
          name: c.label,
          value: Number(readFen(c, 'salesAmount') ?? 0) / 100
        })),
        // Center annotation via graphic is handled by the parent card.
        emphasis: {
          scale: true,
          scaleSize: 4
        }
      }
    ],
    // Expose total for the card overlay (not consumed by echarts).
    _totalSales: totalSales
  };
}

/** 8-slot bar chart: orders + sales dual axis. */
export function buildTimeSlotOption(slots: DataAnalysisTimeSlotRow[]) {
  if (!slots.length) return {};
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 8 },
    grid: { left: 52, right: 52, top: 36, bottom: 36 },
    xAxis: {
      type: 'category',
      data: slots.map((s) => s.label),
      axisLabel: { interval: 0, rotate: 20, fontSize: 11 }
    },
    yAxis: [
      { type: 'value', name: '订单', position: 'left', minInterval: 1 },
      { type: 'value', name: '销售额', position: 'right' }
    ],
    series: [
      {
        name: '订单数',
        type: 'bar',
        yAxisIndex: 0,
        data: slots.map((s) => s.orderCount),
        itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28
      },
      {
        name: '销售额',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: slots.map((s) => Number(readFen(s, 'salesAmount') ?? 0) / 100),
        itemStyle: { color: '#f97316' },
        lineStyle: { width: 2 }
      }
    ]
  };
}

/** Hourly order volume for the selected window. */
export function buildHourlyOption(hourly: DataAnalysisHourlyRow[]) {
  // Fill 0-23 so empty hours still show on the axis.
  const byHour = new Map(hourly.map((h) => [h.hour, h]));
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const orders = hours.map((h) => byHour.get(h)?.orderCount ?? 0);
  const sales = hours.map((h) => Number(readFen(byHour.get(h), 'salesAmount') ?? 0) / 100);
  if (!hourly.length) return {};
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 8 },
    grid: { left: 48, right: 48, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      data: hours.map((h) => `${String(h).padStart(2, '0')}:00`),
      axisLabel: { interval: 2, fontSize: 11 }
    },
    yAxis: [
      { type: 'value', name: '订单', position: 'left', minInterval: 1 },
      { type: 'value', name: '销售额', position: 'right' }
    ],
    series: [
      {
        name: '订单数',
        type: 'bar',
        yAxisIndex: 0,
        data: orders,
        itemStyle: { color: '#60a5fa', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 14
      },
      {
        name: '销售额',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: sales,
        itemStyle: { color: '#10b981' },
        areaStyle: { color: 'rgba(16, 185, 129, 0.08)' },
        lineStyle: { width: 2 }
      }
    ]
  };
}
