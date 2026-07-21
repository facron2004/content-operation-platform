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
  memberCount: number;
  activityLevel: 'high' | 'medium' | 'low';
  tags: string[];
  isActive: boolean;
  source?: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface DistributionExecution {
  executionId: string;
  taskId: string;
  action: 'publish' | 'reschedule' | 'cancel' | 'confirm_fail';
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
