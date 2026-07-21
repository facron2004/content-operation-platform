export type OperationAlertType =
  | 'continuous_unsold'
  | 'abnormal_sold_out'
  | 'high_refund'
  | 'low_verify'
  | 'missing_use_rules'
  | 'missing_selling_points'
  | 'inventory_abnormal'
  | 'price_abnormal'
  | 'merchant_abnormal';
export interface OperationAlert {
  alertId: string;
  packageId: string;
  packageName: string;
  merchantName: string;
  areaName: string;
  type: OperationAlertType;
  level: 'info' | 'warning' | 'danger';
  title: string;
  reason: string;
  action: string;
  createdAt: string;
  priorityScore?: number;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}
export type { OperationCard } from './operation-card-types';
