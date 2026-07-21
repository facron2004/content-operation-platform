import type { PerformanceResponse } from '@content/shared';
import { channelLabels } from '../../utils/labels';
export function buildPerformanceVersionOption(rows: PerformanceResponse['versionComparison']) {
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 38, right: 18, top: 40, bottom: 32 },
    xAxis: { type: 'category', data: rows.map((row) => row.copyVersion) },
    yAxis: { type: 'value' },
    series: [
      {
        name: '点击',
        type: 'bar',
        data: rows.map((row) => row.clickCount),
        itemStyle: { color: '#2f6f73' }
      },
      {
        name: '下单',
        type: 'bar',
        data: rows.map((row) => row.orderCount),
        itemStyle: { color: '#d18b34' }
      }
    ]
  };
}
export function buildPerformanceChannelOption(items: PerformanceResponse['items']) {
  const grouped = items.reduce((acc: Record<string, number>, row) => {
    const label = channelLabels[row.channel] ?? row.channel;
    acc[label] = (acc[label] ?? 0) + row.clickCount;
    return acc;
  }, {});
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        data: Object.entries(grouped).map(([name, value]) => ({ name, value }))
      }
    ]
  };
}
