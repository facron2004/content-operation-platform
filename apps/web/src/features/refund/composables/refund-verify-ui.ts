import type { TopMerchantRow } from '../../../services/api/refund.api';
import { rateClass, rateClassInv } from '../../../utils/format';
import type { RefundVerifyTab, RefundVerifyTrendPoint } from './refund-verify-core';

export function refundVerifyRowClass(row: TopMerchantRow, activeTab: RefundVerifyTab): string {
  if (activeTab === 'refund') {
    if (row.refundRate >= 0.1) return 'is-danger';
    if (row.refundRate >= 0.05) return 'is-warning';
  } else {
    if (row.verifyRate < 0.3 && row.verifyRate > 0) return 'is-danger';
    if (row.verifyRate < 0.6 && row.verifyRate > 0) return 'is-warning';
  }
  return '';
}

export function merchantRateClass(row: TopMerchantRow, tab: RefundVerifyTab) {
  if (tab === 'refund') return rateClass(row.refundRate, 0.05, 0.1);
  return rateClassInv(row.verifyRate, 0.6, 0.3);
}

export function buildRefundVerifyTrendOption(
  trend: RefundVerifyTrendPoint[],
  activeTab: RefundVerifyTab
) {
  if (trend.length === 0) return {};
  const amountName = activeTab === 'refund' ? '退款金额' : '核销金额';
  const amountColor = activeTab === 'refund' ? '#ef4444' : '#10b981';
  const areaColor = activeTab === 'refund' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)';
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 60, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: trend.map((p) => p.date.slice(5)) },
    yAxis: [
      { type: 'value', name: amountName, position: 'left' },
      { type: 'value', name: '成单数', position: 'right' }
    ],
    series: [
      {
        name: amountName,
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: trend.map((p) => Number(p.amount.toFixed(2))),
        itemStyle: { color: amountColor },
        areaStyle: { color: areaColor }
      },
      {
        name: '成单数',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: trend.map((p) => p.paidOrderCount),
        itemStyle: { color: '#f97316' }
      }
    ]
  };
}
