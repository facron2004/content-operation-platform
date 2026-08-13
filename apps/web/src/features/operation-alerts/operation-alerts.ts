import { displayMoney } from '../../utils/format';
import type { GmvMerchantRow } from '../../services/api/gmv.api';

export const HIGH_REFUND_RATE = 0.05;
export const CRITICAL_REFUND_RATE = 0.08;
export const LOW_VERIFY_RATE = 0.5;
export const CRITICAL_VERIFY_RATE = 0.3;
export const MIN_PAID_ORDER_COUNT = 3;

export type OperationAlertKind = 'refund' | 'verify';
export type OperationAlertLevel = 'danger' | 'warning';

export type OperationAlert = {
  id: string;
  kind: OperationAlertKind;
  level: OperationAlertLevel;
  merchantId: string;
  merchantName: string;
  areaName: string | null;
  rate: number;
  paidOrderCount: number;
  gmvDisplay: string;
  title: string;
  action: string;
};

function levelFor(kind: OperationAlertKind, rate: number): OperationAlertLevel {
  return kind === 'refund'
    ? rate >= CRITICAL_REFUND_RATE
      ? 'danger'
      : 'warning'
    : rate < CRITICAL_VERIFY_RATE
      ? 'danger'
      : 'warning';
}

export function buildOperationAlerts(
  rows: GmvMerchantRow[],
  minPaidOrderCount = MIN_PAID_ORDER_COUNT
): OperationAlert[] {
  const alerts: OperationAlert[] = [];
  for (const row of rows) {
    if (row.paidOrderCount < minPaidOrderCount) continue;
    if (row.refundRate >= HIGH_REFUND_RATE) {
      alerts.push({
        id: `${row.merchantId}:refund`,
        kind: 'refund',
        level: levelFor('refund', row.refundRate),
        merchantId: row.merchantId,
        merchantName: row.merchantName,
        areaName: row.areaName,
        rate: row.refundRate,
        paidOrderCount: row.paidOrderCount,
        gmvDisplay: displayMoney(row, 'gmv'),
        title: '高退款率',
        action: '核查套餐承诺、履约与退款原因'
      });
    }
    if (row.verifyRate < LOW_VERIFY_RATE) {
      alerts.push({
        id: `${row.merchantId}:verify`,
        kind: 'verify',
        level: levelFor('verify', row.verifyRate),
        merchantId: row.merchantId,
        merchantName: row.merchantName,
        areaName: row.areaName,
        rate: row.verifyRate,
        paidOrderCount: row.paidOrderCount,
        gmvDisplay: displayMoney(row, 'gmv'),
        title: '低核销率',
        action: '核查预约、到店引导与服务履约'
      });
    }
  }
  return alerts.sort((left, right) => {
    if (left.level !== right.level) return left.level === 'danger' ? -1 : 1;
    if (left.kind !== right.kind) return left.kind === 'refund' ? -1 : 1;
    return left.kind === 'refund' ? right.rate - left.rate : left.rate - right.rate;
  });
}
