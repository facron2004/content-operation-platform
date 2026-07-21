import type { AuditStatus, Channel, StrategyType } from './package-types';
export interface GeneratedCopy {
  contentId: string;
  packageId: string;
  areaId: string;
  merchantId: string;
  channel: Channel;
  scenario: string;
  title: string;
  body: string;
  cta: string;
  copyVersion: string;
  strategyType: StrategyType;
  riskLevel: 'low' | 'medium' | 'high';
  riskTips: string[];
  auditStatus: AuditStatus;
  auditRemark?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface CopyPerformance {
  id: string;
  contentId: string;
  packageId: string;
  channel: Channel;
  groupId?: string | null;
  leaderId?: string | null;
  exposureCount: number;
  clickCount: number;
  orderCount: number;
  paidOrderCount: number;
  verifyCount: number;
  refundCount: number;
  gmv: number;
  conversionRate: number;
  createdAt: string;
  updatedAt: string;
}
