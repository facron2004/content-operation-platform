/* V0.2.0 Task & Campaign domain types */
export interface MarketingCampaign {
  campaignId: string;
  name: string;
  description?: string;
  campaignType:
    'daily' | 'zero_sales_wakeup' | 'flash' | 'new_product' | 'verify_reminder' | 'merchant_join';
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  startDate: string;
  endDate: string;
  areaIds: string[];
  merchantIds?: string[];
  budget: number;
  targetGmv: number;
  targetOrders: number;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityGroupEntity {
  groupId: string;
  groupName: string;
  groupType: 'wechat_group' | 'moments' | 'merchant_share';
  areaId: string;
  areaName?: string;
  ownerId?: string;
  ownerName?: string;
  /** Residual #231: API returns masked last-4 (never raw PII). */
  ownerPhone?: string;
  memberCount: number;
  activityLevel: 'high' | 'medium' | 'low';
  tags: string[];
  // Residual #236: API already returns preferredCategories (JSON array).
  preferredCategories?: string[];
  isActive: boolean;
  source?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus =
  | 'draft'
  | 'waiting_audit'
  | 'scheduled'
  | 'published'
  | 'completed'
  | 'overdue'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export type TaskChannel = 'wechat_group' | 'moments' | 'merchant_share';
export type TaskPriority = 'urgent' | 'normal' | 'low';

export interface DistributionTask {
  taskId: string;
  campaignId?: string;
  contentId?: string;
  groupId?: string;
  packageId: string;
  packageName?: string;
  channel: TaskChannel;
  title?: string;
  body?: string;
  cta?: string;
  trackingCode?: string;
  status: TaskStatus;
  priority: TaskPriority;
  plannedAt?: string;
  publishedAt?: string;
  completedAt?: string;
  cancelReason?: string;
  assigneeId?: string;
  assigneeName?: string;
  // Residual #233: API already returns these (Create/UpdateTaskDto + list SELECT).
  riskLevel?: 'low' | 'medium' | 'high';
  fallbackPackageId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Residual #181: schedule/complete are first-class lifecycle actions written by
 * DistributionTaskService (parity with CreateExecutionInput). Keep reschedule for
 * historical rows even if no current writer emits it.
 */
export type DistributionExecutionAction =
  'publish' | 'reschedule' | 'schedule' | 'complete' | 'cancel' | 'confirm_fail';

export interface DistributionExecution {
  executionId: string;
  taskId: string;
  action: DistributionExecutionAction;
  operatorId?: string;
  operatorName?: string;
  evidenceUrl?: string;
  failReason?: string;
  failCategory?: string;
  note?: string;
  createdAt: string;
}

export interface TaskPerformanceDaily {
  id: string;
  taskId: string;
  date: string;
  visitCount: number;
  uniqueVisitors: number;
  orderCount: number;
  verifyCount: number;
  refundCount: number;
  gmv: number;
  conversionRate: number;
}
