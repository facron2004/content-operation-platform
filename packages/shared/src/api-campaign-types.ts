/* V0.2.0 API response types for tasks */
import type {
  DistributionTask,
  DistributionExecution,
  MarketingCampaign,
  CommunityGroupEntity
} from './api-task-types';

export interface TaskListResponse {
  items: DistributionTask[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TaskDetailResponse extends DistributionTask {
  executions: DistributionExecution[];
  campaignName?: string;
  groupName?: string;
}

export interface CampaignListResponse {
  items: MarketingCampaign[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CommunityListResponse {
  items: CommunityGroupEntity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TaskKpiResponse {
  todayPending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  failed: number;
  todayTaskGmv: number;
}

export interface TaskPerformanceResponse {
  visits: number;
  orders: number;
  gmv: number;
  verifyRate: number;
  refundRate: number;
  conversionRate: number;
}
