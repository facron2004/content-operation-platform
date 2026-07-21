import type { OperationAlert, OperationCard } from './operation-alert-card-types';
import type { CommunityPushTask, DailyOperationReview } from './operation-console-community-types';
export interface TodayOperationConsoleSummary {
  sellingCount: number;
  mustPushCount: number;
  riskCount: number;
  hotOpportunityCount: number;
  slowMovingCount: number;
  communityTaskCount: number;
  avgScore: number;
  dangerAlertCount: number;
  warningAlertCount: number;
  activeAlertCount: number;
  resolvedAlertCount: number;
  updatedAt: string;
  dataSource: 'JeeSite';
  sellingOnly: boolean;
}
export interface TodayOperationConsole {
  date: string;
  summary: TodayOperationConsoleSummary;
  mustPushPackages: OperationCard[];
  riskPackages: OperationCard[];
  hotOpportunities: OperationCard[];
  slowMovingPackages: OperationCard[];
  communityTasks: CommunityPushTask[];
  yesterdayReview: DailyOperationReview;
  alerts: OperationAlert[];
}
