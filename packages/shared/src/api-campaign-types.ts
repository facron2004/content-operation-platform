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
  /**
   * Residual #271: INTERACTIVE_LIST_MAX_DAYS window applied to createdAt.
   * Nested community/campaign task lists and global listTasks share this shape.
   */
  dateFrom?: string;
  dateTo?: string;
}

export interface TaskDetailResponse extends DistributionTask {
  executions: DistributionExecution[];
  /**
   * Residual #260: true when API clipped the ASC LIMIT timeline
   * (EXECUTION_TIMELINE_LIMIT) — newer executions may be missing.
   */
  executionsTruncated?: boolean;
  executionsLimit?: number;
  campaignName?: string;
  groupName?: string;
}

export interface CampaignListResponse {
  items: MarketingCampaign[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * Residual #276: INTERACTIVE_LIST_MAX_DAYS effective startDate window when
   * startDateFrom and/or startDateTo filters are applied (one-sided fills the
   * other bound). Omitted when no date filter is active (default list is unbounded).
   */
  startDateFrom?: string;
  startDateTo?: string;
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

/**
 * Residual #182: task-scoped TPD aggregate (visits/orders/rates) — distinct from
 * Campaign/CommunityPerformanceResponse (task-count/GMV shells). API also returns
 * the interactive 90d window bounds used by getTaskPerformance.
 */
export interface TaskPerformanceResponse {
  visits: number;
  orders: number;
  gmv: number;
  verifyRate: number;
  refundRate: number;
  conversionRate: number;
  dateFrom?: string;
  dateTo?: string;
}

/** Residual #178: campaign-scoped aggregate (not platform TaskKpiResponse). */
export interface CampaignPerformanceResponse {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalGmv: number;
  totalOrders: number;
  dateFrom: string;
  dateTo: string;
}

/**
 * Residual #179: community-scoped aggregate (not TaskPerformanceResponse rates).
 * Shape matches community.service getPerformance (no totalOrders — TPD gmv only).
 */
export interface CommunityPerformanceResponse {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalGmv: number;
  dateFrom: string;
  dateTo: string;
}
