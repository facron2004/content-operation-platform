import { CircleCheck, InfoFilled, Timer, Warning } from '@element-plus/icons-vue';
import type { GmvHourlyPoint, GmvKpi } from '../../../services/api/gmv.api';
import { readFen } from '../../../utils/format';
import type { GmvCategoryRow } from './gmv-cockpit-core';

export type InsightTone = 'blue' | 'orange' | 'green' | 'purple';

export type GmvInsightItem = {
  key: string;
  tone: InsightTone;
  icon: unknown;
  title: string;
  desc: string;
};

export type GmvInsightInput = {
  kpi: GmvKpi | null;
  hourly: GmvHourlyPoint[];
  categories: GmvCategoryRow[];
};

export function buildGmvInsights({ kpi, hourly, categories }: GmvInsightInput): GmvInsightItem[] {
  const items: GmvInsightItem[] = [];

  // 1. 成交高峰时段（from hourly）
  if (hourly.length > 0) {
    let peak = hourly[0];
    let total = 0;
    for (const point of hourly) {
      const value = Number(readFen(point, 'totalGmv') ?? 0);
      total += value;
      if (value > Number(readFen(peak, 'totalGmv') ?? 0)) peak = point;
    }
    const peakValue = Number(readFen(peak, 'totalGmv') ?? 0);
    const share = total > 0 ? ((peakValue / total) * 100).toFixed(1) : '0.0';
    items.push({
      key: 'peak',
      tone: 'blue',
      icon: Timer,
      title: `${peak.label} 成交高峰`,
      desc: `该时段净 GMV 占比 ${share}%`
    });
  }

  // 2. 核销率变化
  if (kpi) {
    const verifyRate = kpi.verifyRate;
    const delta = kpi.compare?.verifyRate;
    if (verifyRate > 0) {
      const pp = delta != null ? Math.abs(delta * 100).toFixed(2) : null;
      const down = delta != null && delta < 0;
      items.push({
        key: 'verify',
        tone: down ? 'orange' : 'green',
        icon: down ? Warning : CircleCheck,
        title: down ? '核销率较昨日下降' : '核销率表现稳健',
        desc: pp
          ? `核销率${(verifyRate * 100).toFixed(2)}%，较昨日${down ? '↓' : '↑'}${pp}pp`
          : `核销率${(verifyRate * 100).toFixed(2)}%`
      });
    }
  }

  // 3. 品类亮点
  if (categories.length > 0) {
    const top = [...categories].sort((a, b) => b.share - a.share)[0];
    items.push({
      key: 'top-category',
      tone: 'green',
      icon: CircleCheck,
      title: `${top.name}表现亮眼`,
      desc: `${top.name}品类净 GMV 占比 ${(top.share * 100).toFixed(1)}%`
    });
  }

  // 4. 退款率
  if (kpi) {
    const refundRate = kpi.refundRate;
    const delta = kpi.compare?.refundRate;
    const pp = delta != null ? Math.abs(delta * 100).toFixed(2) : null;
    const down = delta != null && delta < 0;
    items.push({
      key: 'refund',
      tone: 'purple',
      icon: InfoFilled,
      title: refundRate < 0.05 ? '退款率稳定' : '退款率偏高',
      desc: pp
        ? `退款率${(refundRate * 100).toFixed(2)}%，环比${down ? '下降' : '上升'}${pp}pp`
        : `退款率${(refundRate * 100).toFixed(2)}%`
    });
  }

  return items;
}
