export type UserRole =
  'platform_operator' | 'area_operator' | 'merchant_operator' | 'auditor' | 'executor' | 'admin';
export const USER_ROLES: readonly UserRole[] = [
  'platform_operator',
  'area_operator',
  'merchant_operator',
  'auditor',
  'executor',
  'admin'
];
export type PackageType = 'welfare' | 'commission' | 'fallback';
export type PackageStatus =
  | 'pending_launch'
  | 'cold_start'
  | 'healthy_sales'
  | 'surging'
  | 'nearly_sold_out'
  | 'sold_out'
  | 'poor_sales'
  | 'high_refund_risk'
  | 'high_verify'
  | 'low_verify'
  | 'unclear_selling_point'
  | 'conversion_weak';
export type SaleStatus = 'pending' | 'selling' | 'recycle';
export type PromotionLevel = 'S' | 'A' | 'B' | 'C' | 'D';
export type StrategyType =
  | 'preheat'
  | 'launch'
  | 'sprint'
  | 'fallback'
  | 'wake_up'
  | 'conversion_optimize'
  | 'verify_reminder'
  | 'merchant_co_promotion'
  | 'leader_growth';
export type Channel = 'wechat_group' | 'moments' | 'merchant_share';
export type AuditStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'risk';
