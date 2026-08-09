import { describe, expect, it } from 'vitest';
import type { GmvHourlyPoint, GmvKpi } from '../../../services/api/gmv.api';
import type { GmvCategoryRow } from './gmv-cockpit-core';
import { buildGmvInsights } from './gmv-insights';

const baseKpi: GmvKpi = {
  date: '2026-08-09',
  totalGmv: 10000,
  gmvOnline: 5000,
  gmvWallet: 3000,
  gmvBonus: 2000,
  gmvCard: 0,
  totalRefund: 800,
  refundRate: 0.08,
  refundOrderCount: 2,
  totalVerify: 6000,
  verifyRate: 0.6,
  paidOrderCount: 10,
  paidAmountBonus: 2000,
  paidAmountWallet: 3000,
  avgOrderValue: 1000,
  monthGmv: 30000,
  monthGmvOnline: 15000,
  monthGmvWallet: 9000,
  platformCommission: 300,
  updatedAt: '2026-08-09T00:00:00.000Z',
  dataSource: 'DailyMetrics'
};

const hourly: GmvHourlyPoint[] = [
  { hour: 8, label: '08:00', totalGmv: 10000, paidOrderCount: 1 },
  { hour: 9, label: '09:00', totalGmv: 30000, paidOrderCount: 3 }
];

const categories: GmvCategoryRow[] = [
  { name: '火锅', value: 300, share: 0.6, color: '#2e90fa' },
  { name: '烧烤', value: 200, share: 0.4, color: '#12b76a' }
];

describe('buildGmvInsights', () => {
  it('builds the peak, verify, category, and refund insights with existing copy', () => {
    const insights = buildGmvInsights({
      kpi: { ...baseKpi, compare: { verifyRate: -0.02, refundRate: 0.01 } },
      hourly,
      categories
    });

    expect(insights.map((item) => item.key)).toEqual(['peak', 'verify', 'top-category', 'refund']);
    expect(insights[0]).toMatchObject({
      title: '09:00 成交高峰',
      desc: '该时段GMV占比75.0%'
    });
    expect(insights[1]).toMatchObject({
      tone: 'orange',
      title: '核销率较昨日下降',
      desc: '核销率60.00%，较昨日↓2.00pp'
    });
    expect(insights[2]).toMatchObject({
      title: '火锅表现亮眼',
      desc: '火锅品类GMV占比60.0%'
    });
    expect(insights[3]).toMatchObject({
      title: '退款率偏高',
      desc: '退款率8.00%，环比上升1.00pp'
    });
  });

  it('keeps empty inputs empty and omits zero verify rates', () => {
    expect(buildGmvInsights({ kpi: null, hourly: [], categories: [] })).toEqual([]);

    const insights = buildGmvInsights({
      kpi: { ...baseKpi, verifyRate: 0, refundRate: 0.01 },
      hourly: [],
      categories: []
    });

    expect(insights.map((item) => item.key)).toEqual(['refund']);
    expect(insights[0]).toMatchObject({
      title: '退款率稳定',
      desc: '退款率1.00%'
    });
  });

  it('reads fen-compatible hourly values without changing the peak share', () => {
    const fenHourly: GmvHourlyPoint[] = [
      { hour: 8, label: '08:00', totalGmv: 100, paidOrderCount: 1 },
      { hour: 9, label: '09:00', totalGmv: 300, paidOrderCount: 3 }
    ];

    const insights = buildGmvInsights({ kpi: null, hourly: fenHourly, categories: [] });

    expect(insights[0]).toMatchObject({
      title: '09:00 成交高峰',
      desc: '该时段GMV占比75.0%'
    });
  });
});
