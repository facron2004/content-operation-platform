export const RULE_TYPES = ['promotion', 'copy', 'inventory', 'alert'] as const;
export type RuleType = (typeof RULE_TYPES)[number];
export type RuleConfigPayload = Record<string, unknown>;
export interface RuleConfig {
  id: string;
  tenantId?: string | null;
  merchantId?: string | null;
  type: RuleType;
  name: string;
  version: number;
  isActive: boolean;
  payload: RuleConfigPayload;
  comment?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
