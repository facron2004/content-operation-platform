import type { AuditStatus, Channel } from './package-types';
export type { GeneratedCopy, CopyPerformance } from './copy-entity-types';
export interface GenerateCopyRequest {
  packageId: string;
  channel: Channel;
  scenario?: string;
  tone?: string;
  copyCount: number;
  createdBy?: string;
  useAI?: boolean;
  extraInstruction?: string;
}
export interface AuditCopyRequest {
  auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>;
  auditRemark?: string;
  title?: string;
  body?: string;
}
