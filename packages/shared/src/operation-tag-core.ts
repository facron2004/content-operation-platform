export type OperationTagKey =
  | 'hot_restock_needed'
  | 'continuous_slow'
  | 'high_refund_risk'
  | 'high_verify_quality'
  | 'ending_clearance'
  | 'price_advantage'
  | 'fallback_package'
  | 'community_focus';
export type OperationTagLevel = 'success' | 'warning' | 'danger' | 'info';
export interface OperationTag {
  key: OperationTagKey;
  label: string;
  level: OperationTagLevel;
  reason: string;
}
