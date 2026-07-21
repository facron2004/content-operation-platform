export const CHANNELS = ['wechat_group', 'moments', 'merchant_share'] as const;
export const AUDIT_DECISION_STATUSES = ['approved', 'rejected', 'risk'] as const;
export const ALERT_LEVELS = ['info', 'warning', 'danger'] as const;
export const ALERT_TYPES = [
  'continuous_unsold',
  'abnormal_sold_out',
  'high_refund',
  'low_verify',
  'missing_use_rules',
  'missing_selling_points',
  'inventory_abnormal',
  'price_abnormal',
  'merchant_abnormal'
] as const;
export const PACKAGE_TYPES = ['welfare', 'commission', 'fallback'] as const;
export const SALE_STATUSES = ['pending', 'selling', 'recycle'] as const;
export const INVENTORY_PRIORITIES = ['normal', 'backlog_3d'] as const;
/** 安全的对象类型守卫,供 API/前端共用,避免重复 `typeof === 'object' && !== null` 写法。 */ export const isRecord =
  (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
export {
  RULE_TYPES,
  type RuleType,
  type RuleConfigPayload,
  type RuleConfig
} from './rule-config-types';
